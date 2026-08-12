// ============================================================================
// Browser-side audio extraction
// ============================================================================
// Pulls the audio track out of a video File and returns a small MP3 Blob
// (16 kHz mono, low bitrate) suitable for sending to the transcription service.
//
// This is best-effort — a silent video or an undecodable track means we fall back
// to a visual-only analysis. But it used to fail SILENTLY: seven different
// `return null` paths all surfaced as the same "No narration was picked up",
// which is indistinguishable from a genuinely silent video. So every failure now
// carries a reason the arborist (and we) can act on.
//
// Memory is the real constraint here, not codecs. The whole video has to be in
// memory to decode it, and phone video is enormous: iPhone 4K at 30fps runs about
// 170 MB per minute. Recording at 1080p is roughly a third of that and costs
// nothing in analysis quality, since frames are downscaled to 800px anyway.
// ============================================================================

const TARGET_RATE = 16000; // Whisper's native sample rate
const MP3_KBPS = 32; // low bitrate mono — plenty for speech, keeps the file tiny

export type AudioExtraction = {
  mp3: Blob | null;
  /** Why there's no audio, when there isn't. Absent on success. */
  reason?: string;
};

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Phone video is large enough that this is the likeliest failure, so the message
// says what to do about it rather than just what went wrong.
function sizeAdvice(file: File): string {
  return (
    `The video is ${mb(file.size)}, which may be too much for the browser to hold in ` +
    `memory. Recording at 1080p instead of 4K is about a third the size and doesn't ` +
    `reduce analysis quality.`
  );
}

export async function extractAudioMp3(file: File): Promise<AudioExtraction> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { mp3: null, reason: `Couldn't read the video file. ${sizeAdvice(file)}` };
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { mp3: null, reason: "This browser can't decode audio in the page." };
  }

  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    // Passed directly, NOT via slice(0). decodeAudioData detaches the buffer it's
    // given, and nothing here needs it afterwards — copying it first doubled peak
    // memory at exactly the moment memory is tightest, which on a phone-sized 4K
    // clip is the difference between working and the tab being killed.
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    return {
      mp3: null,
      reason:
        `Couldn't decode this video's audio track${detail}. Either it has no audio, ` +
        `or the format isn't one this browser can decode. ${sizeAdvice(file)}`,
    };
  } finally {
    void decodeCtx.close?.();
  }

  if (!decoded || decoded.length === 0) {
    return { mp3: null, reason: 'That video has no audio in it.' };
  }

  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!OfflineCtx) {
    return { mp3: null, reason: "This browser can't resample audio in the page." };
  }

  try {
    // Resample to 16 kHz mono via an offline render.
    const frameCount = Math.ceil(decoded.duration * TARGET_RATE);
    if (frameCount === 0) {
      return { mp3: null, reason: 'The audio track has no length.' };
    }
    const offline = new OfflineCtx(1, frameCount, TARGET_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    // Float32 [-1,1] -> Int16 PCM.
    const float = rendered.getChannelData(0);
    const pcm = new Int16Array(float.length);
    for (let i = 0; i < float.length; i++) {
      const s = Math.max(-1, Math.min(1, float[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Encode MP3 with lamejs (loaded lazily so it never touches SSR).
    const mod = (await import('@breezystack/lamejs')) as unknown as {
      Mp3Encoder?: new (channels: number, rate: number, kbps: number) => Mp3Enc;
      default?: { Mp3Encoder: new (channels: number, rate: number, kbps: number) => Mp3Enc };
    };
    const Mp3Encoder = mod.Mp3Encoder || mod.default?.Mp3Encoder;
    if (!Mp3Encoder) {
      return { mp3: null, reason: 'The MP3 encoder failed to load.' };
    }

    const encoder = new Mp3Encoder(1, TARGET_RATE, MP3_KBPS);
    const chunks: Uint8Array[] = [];
    const blockSize = 1152;
    for (let i = 0; i < pcm.length; i += blockSize) {
      const block = pcm.subarray(i, i + blockSize);
      const buf = encoder.encodeBuffer(block);
      if (buf.length > 0) chunks.push(new Uint8Array(buf));
    }
    const end = encoder.flush();
    if (end.length > 0) chunks.push(new Uint8Array(end));

    // Cast to satisfy TS's BlobPart typing across lib versions.
    const mp3 = new Blob(chunks as unknown as BlobPart[], { type: 'audio/mp3' });
    if (mp3.size === 0) {
      return { mp3: null, reason: 'The audio encoded to an empty file.' };
    }
    return { mp3 };
  } catch (err) {
    const detail = err instanceof Error && err.message ? `: ${err.message}` : '';
    return { mp3: null, reason: `Preparing the audio failed${detail}.` };
  }
}

type Mp3Enc = {
  encodeBuffer: (left: Int16Array) => Int8Array;
  flush: () => Int8Array;
};

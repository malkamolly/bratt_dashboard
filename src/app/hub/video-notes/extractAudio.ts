// ============================================================================
// Browser-side audio extraction
// ============================================================================
// Pulls the audio track out of a video File and returns a small MP3 Blob
// (16 kHz mono, low bitrate) suitable for sending to the transcription service.
// A 10-minute walkthrough comes out around 2-3 MB — well under the upload limit.
//
// This is best-effort: if the video is silent, the codec can't be decoded, or
// anything else goes wrong, it returns null and the caller just skips audio and
// runs the visual analysis alone.
// ============================================================================

const TARGET_RATE = 16000; // Whisper's native sample rate
const MP3_KBPS = 32; // low bitrate mono — plenty for speech, keeps the file tiny

export async function extractAudioMp3(file: File): Promise<Blob | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const decodeCtx = new AudioCtx();
    let decoded: AudioBuffer;
    try {
      decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      return null; // no decodable audio track
    } finally {
      decodeCtx.close?.();
    }
    if (!decoded || decoded.length === 0) return null;

    // Resample to 16 kHz mono via an offline render.
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineCtx) return null;
    const frameCount = Math.ceil(decoded.duration * TARGET_RATE);
    if (frameCount === 0) return null;
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
    if (!Mp3Encoder) return null;

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
    return new Blob(chunks as unknown as BlobPart[], { type: 'audio/mp3' });
  } catch {
    return null;
  }
}

type Mp3Enc = {
  encodeBuffer: (left: Int16Array) => Int8Array;
  flush: () => Int8Array;
};

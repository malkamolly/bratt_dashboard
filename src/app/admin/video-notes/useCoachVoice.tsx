'use client';

// ============================================================================
// useCoachVoice — shared voice engine for Coach Mode and the Playbook refine chat
// ============================================================================
// Text-to-speech uses Groq's natural Orpheus voices (via /api/video-notes/tts),
// falling back to the browser's built-in voice only if that errors. Also
// handles tap-to-talk recording → Whisper transcription and a hands-free mode
// that listens automatically and stops when you go quiet. Components drive the
// conversation loop with speak() + listenOnce().
// ============================================================================

import { useEffect, useRef, useState } from 'react';

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

// Minimal shape of the browser's built-in speech recognition — the same engine
// phone voice-to-text uses. Declared locally rather than relying on lib.dom,
// which types it inconsistently across TypeScript versions.
type LiveResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type LiveResultEvent = { resultIndex: number; results: ArrayLike<LiveResult> };
type LiveRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: LiveResultEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

// The voices offered in the picker — the four Connor chose after listening on
// openai.fm. Overridable via NEXT_PUBLIC_TTS_VOICES (comma-separated) so that
// changing voice provider stays a config change, matching the server route.
// A voice saved from an older list is ignored on load (see the restore effect).
const DEFAULT_VOICES = ['sage', 'ash', 'cedar', 'marin'];

const configuredVoices = (process.env.NEXT_PUBLIC_TTS_VOICES || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

export const PREMIUM_VOICES = (
  configuredVoices.length > 0 ? configuredVoices : DEFAULT_VOICES
).map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) }));

const DEFAULT_VOICE = PREMIUM_VOICES[0].id;

// Split a reply for speaking. The first chunk is deliberately left as a single
// sentence: it alone decides how long the arborist waits before hearing anything.
// Later chunks may merge, since they're fetched while earlier audio is playing.
const SPEECH_CHUNK_CHARS = 350;

export function splitForSpeech(text: string): string[] {
  const sentences = (text.match(/[^.!?]+[.!?]*\s*/g) ?? [text])
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [text];

  const chunks: string[] = [];
  for (const sentence of sentences) {
    const last = chunks[chunks.length - 1];
    const canMerge =
      chunks.length > 1 && last.length + sentence.length + 1 <= SPEECH_CHUNK_CHARS;
    if (canMerge) chunks[chunks.length - 1] = `${last} ${sentence}`;
    else chunks.push(sentence);
  }
  return chunks;
}

async function transcribeBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'answer.webm');
  const res = await fetch('/api/video-notes/transcribe', { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Transcription failed.');
  return ((json.text as string) || '').trim();
}

export function useCoachVoice() {
  const [ttsVoice, setTtsVoice] = useState(DEFAULT_VOICE);
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [listening, setListening] = useState(false);
  const [premiumFailed, setPremiumFailed] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [ttsRate, setTtsRate] = useState(1);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  // Stage timings for the reply lag, surfaced in the UI. Guesswork about which
  // stage dominates has been wrong twice; these are the real numbers.
  const [timings, setTimings] = useState({ transcribeMs: 0, firstAudioMs: 0 });

  const ttsVoiceRef = useRef(DEFAULT_VOICE);
  const ttsRateRef = useRef(1);
  const mutedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const browserVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const recognitionRef = useRef<LiveRecognition | null>(null);
  const speakTokenRef = useRef(0);
  const speechQueueRef = useRef<string[]>([]);
  const speechActiveRef = useRef(false);
  const utteranceStartRef = useRef(0);
  const meterRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  useEffect(() => {
    ttsVoiceRef.current = ttsVoice;
    localStorage.setItem('coachTTSVoice', ttsVoice);
  }, [ttsVoice]);
  useEffect(() => {
    ttsRateRef.current = ttsRate;
    localStorage.setItem('coachTTSRate', String(ttsRate));
  }, [ttsRate]);
  useEffect(() => void (mutedRef.current = muted), [muted]);
  useEffect(() => void (handsFreeRef.current = handsFree), [handsFree]);

  // Restore the saved voice; load browser voices (only used as a fallback).
  useEffect(() => {
    const saved = localStorage.getItem('coachTTSVoice');
    if (saved && PREMIUM_VOICES.some((v) => v.id === saved)) setTtsVoice(saved);
    const savedRate = parseFloat(localStorage.getItem('coachTTSRate') || '');
    if (savedRate >= 0.5 && savedRate <= 2) setTtsRate(savedRate);
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) browserVoicesRef.current = list;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function stopSpeaking() {
    // Invalidates any chunked utterance still in flight (see speak).
    speakTokenRef.current += 1;
    speechQueueRef.current = [];
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }

  function playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = ttsRateRef.current;
      audioRef.current = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });
  }

  function browserSpeak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const list = browserVoicesRef.current;
      const v =
        list.find((x) => x.default) ||
        list.find((x) => x.lang?.toLowerCase().startsWith('en')) ||
        list[0];
      if (v) u.voice = v;
      u.rate = ttsRateRef.current;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  async function fetchSpeech(text: string): Promise<Blob> {
    const res = await fetch('/api/video-notes/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: ttsVoiceRef.current }),
    });
    if (!res.ok) {
      // The route has already translated the provider's error into a readable
      // line and logged the raw body server-side, so just show what it hands back.
      let detail = `The natural voice failed (${res.status}).`;
      try {
        const j = (await res.json()) as { error?: string };
        detail = j.error || detail;
      } catch {
        /* body was not JSON — keep the status-based message */
      }
      throw new Error(detail);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('The natural voice returned no audio.');
    return blob;
  }

  // --- Speaking a streamed reply ------------------------------------------
  // Feed sentences in as the model writes them; audio for the first one starts
  // while the rest is still arriving. beginUtterance cancels whatever came
  // before, so a new answer never plays over an old one.
  function beginUtterance(): number {
    stopSpeaking();
    utteranceStartRef.current = Date.now();
    return speakTokenRef.current;
  }

  function enqueueSpeech(text: string) {
    const trimmed = text.trim();
    if (mutedRef.current || !trimmed) return;
    speechQueueRef.current.push(trimmed);
    void drainSpeechQueue(speakTokenRef.current);
  }

  async function drainSpeechQueue(token: number) {
    // One consumer at a time; a later enqueue restarts it if the queue drained
    // while the model was mid-sentence.
    if (speechActiveRef.current) return;
    speechActiveRef.current = true;
    try {
      while (speechQueueRef.current.length > 0) {
        if (speakTokenRef.current !== token) return;
        const next = speechQueueRef.current.shift();
        if (!next) continue;
        const blob = await fetchSpeech(next);
        if (speakTokenRef.current !== token) return;
        if (!utteranceStartRef.current) utteranceStartRef.current = Date.now();
        setPremiumFailed(false);
        setTtsError('');
        setTimings((t) =>
          t.firstAudioMs > 0
            ? t
            : { ...t, firstAudioMs: Date.now() - utteranceStartRef.current },
        );
        await playBlob(blob);
      }
    } catch (err) {
      if (speakTokenRef.current !== token) return;
      setPremiumFailed(true);
      setTtsError(err instanceof Error ? err.message : 'Natural voice failed.');
      const remaining = speechQueueRef.current.join(' ');
      speechQueueRef.current = [];
      if (remaining) await browserSpeak(remaining);
    } finally {
      speechActiveRef.current = false;
    }
  }

  // Resolves once this utterance has finished speaking, or once a newer one has
  // superseded it — so hands-free hands the mic back when the coach stops rather
  // than talking over itself.
  async function waitForSpeech(token: number): Promise<void> {
    while (
      speakTokenRef.current === token &&
      (speechActiveRef.current || speechQueueRef.current.length > 0)
    ) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  // Natural voice first; fall back to the browser voice if it errors.
  //
  // Speaks in chunks rather than waiting for the whole reply to be rendered.
  // Generating audio for a long coaching answer takes seconds, and none of it
  // could be heard until all of it existed. Now the first sentence is requested
  // on its own, and each later chunk is fetched while the previous one plays —
  // so time-to-first-word is one short sentence instead of the full answer.
  async function speak(text: string): Promise<void> {
    if (mutedRef.current || !text) return;
    stopSpeaking();
    const token = ++speakTokenRef.current;
    const startedAt = Date.now();
    const chunks = splitForSpeech(text);
    let spokenUpTo = 0;
    try {
      let pending: Promise<Blob> | null = fetchSpeech(chunks[0]);
      for (let i = 0; i < chunks.length; i++) {
        const blob = await pending;
        if (!blob) break;
        // Start the next request before playing this one, so generation overlaps
        // playback instead of following it.
        pending = i + 1 < chunks.length ? fetchSpeech(chunks[i + 1]) : null;
        if (speakTokenRef.current !== token) return;
        if (i === 0) {
          setPremiumFailed(false);
          setTtsError('');
          setTimings((t) => ({ ...t, firstAudioMs: Date.now() - startedAt }));
        }
        await playBlob(blob);
        spokenUpTo = i + 1;
        if (speakTokenRef.current !== token) return;
      }
    } catch (err) {
      // A newer utterance (or a stop) superseded this one — say nothing.
      if (speakTokenRef.current !== token) return;
      setPremiumFailed(true);
      setTtsError(err instanceof Error ? err.message : 'Natural voice failed.');
      // Only read out what wasn't already spoken, so a mid-reply failure doesn't
      // repeat the opening in a different voice.
      const remaining = chunks.slice(spokenUpTo).join(' ');
      if (remaining) await browserSpeak(remaining);
    }
  }

  // --- Mic level ----------------------------------------------------------
  // Bars that move while the arborist talks. This is the answer to "is it even
  // hearing me?" on iPhone, where the dictation below can't run: it reads the
  // same MediaStream the recorder is already using, so there's no second claim
  // on the microphone and nothing to conflict over.
  function startLevelMeter(stream: MediaStream) {
    stopLevelMeter();
    const AudioCtx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      // On iOS a context created after an await starts suspended, so the analyser
      // reads pure silence and the bars sit flat — which is why tap-to-talk showed
      // nothing while hands-free (which already had a running analyser) worked.
      if (ctx.state === 'suspended') void ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let lastPaint = 0;
      const tick = (now: number) => {
        analyser.getByteTimeDomainData(buf);
        // Repaint ~12x a second; per-frame React updates aren't worth the churn.
        if (now - lastPaint > 80) {
          lastPaint = now;
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const x = (buf[i] - 128) / 128;
            sum += x * x;
          }
          // Speech sits well below full scale, so scale up before clamping.
          setMicLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
        }
        if (meterRef.current) meterRef.current.raf = requestAnimationFrame(tick);
      };
      meterRef.current = { ctx, raf: requestAnimationFrame(tick) };
    } catch {
      // A meter is a nicety; never let it break recording.
    }
  }

  function stopLevelMeter() {
    const meter = meterRef.current;
    meterRef.current = null;
    setMicLevel(0);
    if (!meter) return;
    cancelAnimationFrame(meter.raf);
    if (meter.ctx.state !== 'closed') void meter.ctx.close();
  }

  // --- Live dictation -----------------------------------------------------
  // Shows words on screen as the arborist speaks, so he can tell the tool is
  // hearing him instead of finding out only when it fails. This is purely
  // additive: Whisper still produces the transcript that actually gets used,
  // because it handles arborist vocabulary (DBH, codominant, defoliation) far
  // better than the browser engine does. Every failure path here is silent — an
  // unsupported browser, or iOS declining to share the mic with MediaRecorder,
  // must never disturb the recording that matters.
  function startLiveDictation() {
    setLiveTranscript('');
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      SpeechRecognition?: new () => LiveRecognition;
      webkitSpeechRecognition?: new () => LiveRecognition;
    };
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Recognition) return;
    try {
      const rec = new Recognition();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      // Finalized phrases accumulate; the interim tail is replaced each event.
      let settled = '';
      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? '';
          if (result.isFinal) settled += text;
          else interim += text;
        }
        setLiveTranscript((settled + interim).trim());
      };
      rec.onerror = () => {};
      rec.start();
      recognitionRef.current = rec;
    } catch {
      // Live text is a nicety, not the transcript. Carry on without it.
    }
  }

  function stopLiveDictation() {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // Already stopped.
    }
  }

  // --- Manual tap-to-talk -------------------------------------------------
  async function beginRecording(): Promise<boolean> {
    stopSpeaking();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      startLevelMeter(stream);
      startLiveDictation();
      return true;
    } catch {
      return false;
    }
  }

  function endRecording(): Promise<string> {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec) {
        resolve('');
        return;
      }
      rec.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setTranscribing(true);
        const startedAt = Date.now();
        try {
          resolve(await transcribeBlob(blob));
        } catch {
          resolve('');
        } finally {
          setTimings({ transcribeMs: Date.now() - startedAt, firstAudioMs: 0 });
          setTranscribing(false);
          // Keep the live text up through transcription, then let the real
          // message in the chat take over.
          setLiveTranscript('');
        }
      };
      stopLiveDictation();
      stopLevelMeter();
      rec.stop();
      setRecording(false);
    });
  }

  // --- Hands-free: listen until silence, then transcribe ------------------
  async function listenOnce(): Promise<string> {
    stopSpeaking();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return '';
    }
    streamRef.current = stream;
    const AudioCtx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AudioCtx) {
      stream.getTracks().forEach((t) => t.stop());
      return '';
    }
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.start();
    setListening(true);
    startLevelMeter(stream);
    startLiveDictation();

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const THRESHOLD = 0.025;
    // How long a pause has to last before we decide the arborist is done. This
    // was briefly cut to 700ms to save time, which cut people off mid-thought —
    // a natural pause while working out how to phrase something is longer than
    // that. Conversation quality wins over the second it costs; find the time
    // elsewhere.
    const SILENCE_MS = 1500;
    const MAX_MS = 30000;
    const NO_SPEECH_MS = 7000;
    const startedAt = Date.now();
    let spoke = false;
    let lastLoud = Date.now();
    let raf = 0;

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!handsFreeRef.current) return resolve();
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const x = (buf[i] - 128) / 128;
          sum += x * x;
        }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (rms > THRESHOLD) {
          spoke = true;
          lastLoud = now;
        }
        if (spoke && now - lastLoud > SILENCE_MS) return resolve();
        if (now - startedAt > MAX_MS) return resolve();
        if (!spoke && now - startedAt > NO_SPEECH_MS) return resolve();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    cancelAnimationFrame(raf);
    stopLiveDictation();
    stopLevelMeter();

    const blob = await new Promise<Blob>((res) => {
      rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      rec.stop();
    });
    stream.getTracks().forEach((t) => t.stop());
    if (ctx.state !== 'closed') ctx.close();
    setListening(false);

    if (!spoke) {
      setLiveTranscript('');
      return '';
    }
    setTranscribing(true);
    const transcribeStartedAt = Date.now();
    try {
      return await transcribeBlob(blob);
    } catch {
      return '';
    } finally {
      setTranscribing(false);
      setLiveTranscript('');
      setTimings({ transcribeMs: Date.now() - transcribeStartedAt, firstAudioMs: 0 });
    }
  }

  function stopAll() {
    stopSpeaking();
    stopLiveDictation();
    stopLevelMeter();
    setLiveTranscript('');
    handsFreeRef.current = false;
    setHandsFree(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  return {
    ttsVoice,
    setTtsVoice,
    premiumVoices: PREMIUM_VOICES,
    premiumFailed,
    ttsError,
    ttsRate,
    setTtsRate,
    muted,
    setMuted,
    handsFree,
    setHandsFree,
    recording,
    transcribing,
    listening,
    liveTranscript,
    micLevel,
    timings,
    beginUtterance,
    enqueueSpeech,
    waitForSpeech,
    speak,
    stopSpeaking,
    beginRecording,
    endRecording,
    listenOnce,
    stopAll,
  };
}

export type CoachVoice = ReturnType<typeof useCoachVoice>;

// Proof the tool is hearing you. Two layers, because they fail differently:
// the bars read the recorder's own audio and work everywhere including iPhone,
// while the live words come from browser dictation, which iOS won't run at the
// same time as the recorder. On desktop you get both; on a phone, the bars.
export function LiveDictation({ v }: { v: CoachVoice }) {
  const active = v.recording || v.listening;
  if (!active && !v.liveTranscript) return null;

  const bars = [0.15, 0.4, 0.65, 0.4, 0.15];
  return (
    <div className="space-y-1">
      {active && (
        <div className="flex h-6 items-center gap-1">
          {bars.map((weight, i) => (
            <span
              key={i}
              aria-hidden="true"
              // green.dark from the brand palette. The brand lime (#E9E71D) is a
              // bright yellow that all but disappears on the cream card; there are
              // no numbered shades on these custom tokens to fall back to.
              className="w-1.5 rounded-full bg-green-dark transition-[height] duration-75"
              // A visible floor so a quiet cab reads as "listening" rather than
              // "broken" — but tall enough to be unmistakable on a phone screen.
              style={{ height: `${Math.max(6, v.micLevel * weight * 44 + 6)}px` }}
            />
          ))}
          <span className="ml-1 text-xs font-medium text-neutral-600">Listening…</span>
        </div>
      )}
      {v.liveTranscript && (
        <p className="text-sm italic text-neutral-500" aria-live="polite">
          {v.liveTranscript}
        </p>
      )}
    </div>
  );
}

// Shared controls: mute, natural-voice picker, preview, hands-free toggle.
export function VoiceControls({ v }: { v: CoachVoice }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={() => v.setMuted((m) => !m)}
        className="text-xs text-neutral-500 hover:underline"
      >
        {v.muted ? '🔇 Voice off' : '🔊 Voice on'}
      </button>
      {!v.muted && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-neutral-500">Voice</span>
            <select
              value={v.ttsVoice}
              onChange={(e) => v.setTtsVoice(e.target.value)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {v.premiumVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-neutral-500">Speed</span>
            <select
              value={v.ttsRate}
              onChange={(e) => v.setTtsRate(parseFloat(e.target.value))}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={1.75}>1.75×</option>
              <option value={2}>2×</option>
            </select>
          </label>
          <button
            onClick={() => v.speak('Hi! This is how I sound. Ready when you are.')}
            className="text-neutral-600 hover:underline"
          >
            ▶ Preview
          </button>
        </>
      )}
      <label className="flex items-center gap-1 text-neutral-600">
        <input
          type="checkbox"
          checked={v.handsFree}
          onChange={(e) => v.setHandsFree(e.target.checked)}
        />
        Hands-free
      </label>
      {v.premiumFailed && !v.muted && (
        <span className="text-xs text-amber-600">
          Natural voice unavailable — using the device voice.
          {v.ttsError ? ` (${v.ttsError})` : ''}
        </span>
      )}
    </div>
  );
}

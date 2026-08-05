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

// Natural voices offered by Groq's Orpheus English model.
export const PREMIUM_VOICES = [
  { id: 'hannah', label: 'Hannah' },
  { id: 'troy', label: 'Troy' },
  { id: 'austin', label: 'Austin' },
];

async function transcribeBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'answer.webm');
  const res = await fetch('/api/video-notes/transcribe', { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Transcription failed.');
  return ((json.text as string) || '').trim();
}

export function useCoachVoice() {
  const [ttsVoice, setTtsVoice] = useState('hannah');
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [listening, setListening] = useState(false);
  const [premiumFailed, setPremiumFailed] = useState(false);

  const ttsVoiceRef = useRef('hannah');
  const mutedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const browserVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    ttsVoiceRef.current = ttsVoice;
    localStorage.setItem('coachTTSVoice', ttsVoice);
  }, [ttsVoice]);
  useEffect(() => void (mutedRef.current = muted), [muted]);
  useEffect(() => void (handsFreeRef.current = handsFree), [handsFree]);

  // Restore the saved voice; load browser voices (only used as a fallback).
  useEffect(() => {
    const saved = localStorage.getItem('coachTTSVoice');
    if (saved && PREMIUM_VOICES.some((v) => v.id === saved)) setTtsVoice(saved);
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
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  // Natural voice first; fall back to the browser voice if it errors.
  async function speak(text: string): Promise<void> {
    if (mutedRef.current || !text) return;
    stopSpeaking();
    try {
      const res = await fetch('/api/video-notes/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: ttsVoiceRef.current }),
      });
      if (!res.ok) throw new Error('tts');
      const blob = await res.blob();
      if (!blob.size) throw new Error('empty');
      setPremiumFailed(false);
      await playBlob(blob);
    } catch {
      setPremiumFailed(true);
      await browserSpeak(text);
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
        try {
          resolve(await transcribeBlob(blob));
        } catch {
          resolve('');
        } finally {
          setTranscribing(false);
        }
      };
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

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const THRESHOLD = 0.025;
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

    const blob = await new Promise<Blob>((res) => {
      rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      rec.stop();
    });
    stream.getTracks().forEach((t) => t.stop());
    if (ctx.state !== 'closed') ctx.close();
    setListening(false);

    if (!spoke) return '';
    setTranscribing(true);
    try {
      return await transcribeBlob(blob);
    } catch {
      return '';
    } finally {
      setTranscribing(false);
    }
  }

  function stopAll() {
    stopSpeaking();
    handsFreeRef.current = false;
    setHandsFree(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  return {
    ttsVoice,
    setTtsVoice,
    premiumVoices: PREMIUM_VOICES,
    premiumFailed,
    muted,
    setMuted,
    handsFree,
    setHandsFree,
    recording,
    transcribing,
    listening,
    speak,
    stopSpeaking,
    beginRecording,
    endRecording,
    listenOnce,
    stopAll,
  };
}

export type CoachVoice = ReturnType<typeof useCoachVoice>;

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
          Natural voice unavailable — using the device voice. (Check the Groq TTS
          model terms.)
        </span>
      )}
    </div>
  );
}

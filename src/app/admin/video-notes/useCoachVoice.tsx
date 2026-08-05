'use client';

// ============================================================================
// useCoachVoice — shared voice engine for Coach Mode and the Playbook refine chat
// ============================================================================
// Handles: text-to-speech (with a voice picker + speed, remembered), tap-to-talk
// recording → Groq Whisper transcription, and a hands-free mode that listens
// automatically and stops when you go quiet (silence detection). Components
// drive the conversation loop with speak() + listenOnce().
// ============================================================================

import { useEffect, useRef, useState } from 'react';

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

async function transcribeBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', blob, 'answer.webm');
  const res = await fetch('/api/video-notes/transcribe', { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Transcription failed.');
  return ((json.text as string) || '').trim();
}

export function useCoachVoice() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [listening, setListening] = useState(false);

  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const voiceURIRef = useRef('');
  const rateRef = useRef(1);
  const mutedRef = useRef(false);
  const handsFreeRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => void (voicesRef.current = voices), [voices]);
  useEffect(() => {
    voiceURIRef.current = voiceURI;
    if (voiceURI) localStorage.setItem('coachVoiceURI', voiceURI);
  }, [voiceURI]);
  useEffect(() => {
    rateRef.current = rate;
    localStorage.setItem('coachVoiceRate', String(rate));
  }, [rate]);
  useEffect(() => void (mutedRef.current = muted), [muted]);
  useEffect(() => void (handsFreeRef.current = handsFree), [handsFree]);

  // Load the browser's voices (async) and restore saved preferences.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return;
      setVoices(list);
      setVoiceURI((cur) => {
        if (cur && list.some((v) => v.voiceURI === cur)) return cur;
        const saved = localStorage.getItem('coachVoiceURI');
        if (saved && list.some((v) => v.voiceURI === saved)) return saved;
        const pick =
          list.find((v) => v.default) ||
          list.find((v) => v.lang?.toLowerCase().startsWith('en')) ||
          list[0];
        return pick ? pick.voiceURI : '';
      });
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    const savedRate = Number(localStorage.getItem('coachVoiceRate'));
    if (savedRate >= 0.5 && savedRate <= 1.5) setRate(savedRate);
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  // Resolves when the utterance finishes (or immediately if muted).
  function speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (mutedRef.current || typeof window === 'undefined' || !window.speechSynthesis || !text) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = voicesRef.current.find((x) => x.voiceURI === voiceURIRef.current);
      if (v) u.voice = v;
      u.rate = rateRef.current;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
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
    const THRESHOLD = 0.025; // RMS level that counts as speech
    const SILENCE_MS = 1500; // trailing quiet that ends a turn
    const MAX_MS = 30000; // hard cap on one turn
    const NO_SPEECH_MS = 7000; // give up if they never start talking
    const startedAt = Date.now();
    let spoke = false;
    let lastLoud = Date.now();
    let raf = 0;

    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!handsFreeRef.current) return resolve(); // toggled off mid-listen
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
    voices,
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
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

// Shared controls: mute, voice picker, speed, preview, hands-free toggle.
export function VoiceControls({ v }: { v: CoachVoice }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        onClick={() => v.setMuted((m) => !m)}
        className="text-xs text-neutral-500 hover:underline"
      >
        {v.muted ? '🔇 Voice off' : '🔊 Voice on'}
      </button>
      {!v.muted && v.voices.length > 0 && (
        <>
          <label className="flex items-center gap-1">
            <span className="text-neutral-500">Voice</span>
            <select
              value={v.voiceURI}
              onChange={(e) => v.setVoiceURI(e.target.value)}
              className="max-w-[11rem] rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {v.voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-neutral-500">Speed</span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              value={v.rate}
              onChange={(e) => v.setRate(Number(e.target.value))}
            />
            <span className="w-9 text-neutral-500">{v.rate.toFixed(1)}x</span>
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
    </div>
  );
}

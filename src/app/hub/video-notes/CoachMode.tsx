'use client';

// ============================================================================
// Coach Mode — client component
// ============================================================================
// A voice (or typed) mentoring conversation. Claude, playing an eager junior
// arborist, interviews the mentor about the analysis; the mentor answers by
// talking (recorded → Whisper → text) or typing; Claude's replies are read
// aloud. At the end, Claude proposes reusable "lessons" the mentor edits and
// approves into the Playbook.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Findings } from '@/lib/video-notes';
import type { CoachMessage, ProposedLesson } from '@/lib/coach';

export default function CoachMode({ findings }: { findings: Findings }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [coachThinking, setCoachThinking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'chat' | 'lessons'>('chat');
  const [lessons, setLessons] = useState<ProposedLesson[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const startedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  function speak(t: string) {
    if (mutedRef.current || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(t));
  }

  // Ask the coach for its next message given a conversation state.
  async function askCoach(history: CoachMessage[]) {
    setCoachThinking(true);
    setError('');
    try {
      const res = await fetch('/api/video-notes/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings, history, mode: 'chat' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The coach hit an error.');
      const reply = (json.reply as string) || '';
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      speak(reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The coach hit an error.');
    } finally {
      setCoachThinking(false);
    }
  }

  // Kick off the conversation once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    askCoach([]);
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitAnswer(answer: string) {
    const trimmed = answer.trim();
    if (!trimmed) return;
    const next: CoachMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(next);
    setText('');
    askCoach(next);
  }

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await transcribe(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      setError('Could not access the microphone. Check browser permissions, or type your answer.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    setError('');
    try {
      const form = new FormData();
      form.append('audio', blob, 'answer.webm');
      const res = await fetch('/api/video-notes/transcribe', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not transcribe that.');
      if (json.text) submitAnswer(json.text);
      else setError('Nothing was transcribed — try again or type your answer.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed.');
    } finally {
      setTranscribing(false);
    }
  }

  async function wrapUp() {
    setSummarizing(true);
    setError('');
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    try {
      const res = await fetch('/api/video-notes/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings, history: messages, mode: 'summarize' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not summarize.');
      setLessons((json.lessons as ProposedLesson[]) || []);
      setPhase('lessons');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not summarize.');
    } finally {
      setSummarizing(false);
    }
  }

  function updateLesson(i: number, field: keyof ProposedLesson, value: string) {
    setLessons((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  }
  function removeLesson(i: number) {
    setLessons((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function saveLessons() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/video-notes/coach/save-lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const busy = coachThinking || transcribing;

  return (
    <div className="bt-card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Coach Mode</h2>
        <button
          onClick={() => setMuted((m) => !m)}
          className="text-xs text-neutral-500 hover:underline"
        >
          {muted ? '🔇 Voice off' : '🔊 Voice on'}
        </button>
      </div>

      {/* Conversation transcript */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'assistant' ? '' : 'text-right'}>
            <span
              className={`inline-block rounded-lg px-3 py-2 text-sm ${
                m.role === 'assistant'
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'bg-lime/60 text-neutral-900'
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        {coachThinking && <p className="text-sm text-neutral-500">Coach is thinking…</p>}
      </div>

      {phase === 'chat' && (
        <>
          {/* Voice + typed answer controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={busy}
                className="rounded bg-lime px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                🎤 Hold the floor — tap to talk
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="rounded bg-red-500 px-4 py-2 text-sm font-semibold text-white"
              >
                ⏹ Stop &amp; send
              </button>
            )}
            {transcribing && <span className="text-sm text-neutral-500">Transcribing…</span>}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAnswer(text)}
              placeholder="…or type your answer"
              disabled={busy}
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => submitAnswer(text)}
              disabled={busy || !text.trim()}
              className="rounded border border-neutral-400 px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Send
            </button>
          </div>

          <div className="border-t border-neutral-200 pt-3">
            <button
              onClick={wrapUp}
              disabled={busy || summarizing || messages.length < 2}
              className="rounded border border-neutral-400 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {summarizing ? 'Summarizing…' : 'Wrap up & review lessons'}
            </button>
          </div>
        </>
      )}

      {phase === 'lessons' && (
        <div className="space-y-4">
          {saved ? (
            <p className="text-sm text-green-700">
              Saved {lessons.length} lesson{lessons.length === 1 ? '' : 's'} to the Playbook.
              Every future analysis will apply them. 🌳
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-600">
                Here&apos;s what I learned. Edit anything, delete what doesn&apos;t belong,
                then save the keepers into the Playbook.
              </p>
              {lessons.length === 0 && (
                <p className="text-sm text-neutral-500">
                  Nothing reusable came out of this one — that&apos;s okay.
                </p>
              )}
              {lessons.map((l, i) => (
                <div key={i} className="space-y-1 border-l-2 border-lime pl-3">
                  <div className="flex gap-2">
                    <input
                      value={l.category}
                      onChange={(e) => updateLesson(i, 'category', e.target.value)}
                      className="w-40 rounded border border-neutral-300 px-2 py-1 text-xs"
                      placeholder="Category"
                    />
                    <input
                      value={l.title}
                      onChange={(e) => updateLesson(i, 'title', e.target.value)}
                      className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
                      placeholder="Title"
                    />
                    <button
                      onClick={() => removeLesson(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={l.content}
                    onChange={(e) => updateLesson(i, 'content', e.target.value)}
                    rows={2}
                    className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                    placeholder="Guidance"
                  />
                </div>
              ))}
              {lessons.length > 0 && (
                <button
                  onClick={saveLessons}
                  disabled={saving}
                  className="rounded bg-lime px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {saving ? 'Saving…' : `Approve & save ${lessons.length} to Playbook`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

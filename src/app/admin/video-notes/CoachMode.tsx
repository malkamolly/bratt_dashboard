'use client';

// ============================================================================
// Coach Mode — client component
// ============================================================================
// A voice (or typed) mentoring conversation. Claude, playing an eager junior
// arborist, interviews the mentor about the analysis; the mentor answers by
// talking or typing; Claude's replies are read aloud. Hands-free mode listens
// automatically after each reply and sends when the mentor stops talking, so
// there's no button to press each turn. At the end, Claude proposes reusable
// "lessons" the mentor edits and approves into the Playbook.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { Findings } from '@/lib/video-notes';
import type { CoachMessage, ProposedLesson } from '@/lib/coach';
import { useCoachVoice, VoiceControls, LiveDictation } from './useCoachVoice';

export default function CoachMode({ findings }: { findings: Findings }) {
  const v = useCoachVoice();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [coachThinking, setCoachThinking] = useState(false);
  // How long the coach's reply took to come back, for the lag breakdown below.
  const [replyMs, setReplyMs] = useState(0);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'chat' | 'lessons'>('chat');
  const [lessons, setLessons] = useState<ProposedLesson[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const startedRef = useRef(false);
  const phaseRef = useRef<'chat' | 'lessons'>('chat');
  const messagesRef = useRef<CoachMessage[]>([]);

  useEffect(() => void (phaseRef.current = phase), [phase]);
  useEffect(() => void (messagesRef.current = messages), [messages]);

  // Ask the coach for its next message, then speak it and (if hands-free) listen.
  async function askCoach(history: CoachMessage[]) {
    setCoachThinking(true);
    setError('');
    const startedAt = Date.now();
    try {
      const res = await fetch('/api/video-notes/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings, history, mode: 'chat', stream: true }),
      });
      if (!res.ok || !res.body) {
        // Errors still come back as JSON, so read them the old way.
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || 'The coach hit an error.');
      }

      // Read the reply as it's written. Each finished sentence goes straight to
      // the voice, so speaking overlaps writing instead of waiting for it.
      const token = v.beginUtterance();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      let spokenUpTo = 0;
      let firstTextAt = 0;

      // Hand every completed sentence to the voice. `spokenUpTo` is an index into
      // `reply`; matches are found in the unspoken remainder and offsets added
      // back, so the two never get confused.
      const flushSentences = (final: boolean) => {
        for (;;) {
          const rest = reply.slice(spokenUpTo);
          if (!rest.trim()) return;
          const match = rest.match(/[.!?]["')\]]?\s/);
          if (match?.index !== undefined) {
            const end = match.index + match[0].length;
            v.enqueueSpeech(rest.slice(0, end));
            spokenUpTo += end;
            continue;
          }
          // No sentence end yet — wait for more text, unless this is the tail.
          if (final) {
            v.enqueueSpeech(rest);
            spokenUpTo = reply.length;
          }
          return;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        if (!firstTextAt) {
          firstTextAt = Date.now();
          setReplyMs(firstTextAt - startedAt);
          setCoachThinking(false);
        }
        setMessages([...history, { role: 'assistant', text: reply }]);
        flushSentences(false);
      }
      flushSentences(true);

      const next: CoachMessage[] = [...history, { role: 'assistant', text: reply }];
      setMessages(next);
      messagesRef.current = next;
      setCoachThinking(false);
      // Wait for the voice to finish before handing the mic back.
      await v.waitForSpeech(token);
      if (v.handsFree && phaseRef.current === 'chat') void handsFreeListen();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The coach hit an error.');
      setCoachThinking(false);
    }
  }

  function submitAnswer(answer: string) {
    const trimmed = answer.trim();
    if (!trimmed) return;
    const next: CoachMessage[] = [...messagesRef.current, { role: 'user', text: trimmed }];
    setMessages(next);
    messagesRef.current = next;
    setText('');
    askCoach(next);
  }

  async function handsFreeListen() {
    if (v.listening) return;
    const heard = await v.listenOnce();
    if (v.handsFree && phaseRef.current === 'chat' && heard.trim()) submitAnswer(heard);
  }

  // Kick off the conversation once; clean up voice on unmount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    askCoach([]);
    return () => v.stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When hands-free is switched on during the mentor's turn, start listening.
  useEffect(() => {
    if (v.handsFree && phase === 'chat' && !coachThinking && !v.listening) {
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') void handsFreeListen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.handsFree]);

  async function toggleMic() {
    setError('');
    if (v.recording) {
      const heard = await v.endRecording();
      if (heard.trim()) submitAnswer(heard);
    } else {
      const ok = await v.beginRecording();
      if (!ok) setError('Could not access the microphone. Check permissions, or type instead.');
    }
  }

  async function wrapUp() {
    setSummarizing(true);
    setError('');
    v.setHandsFree(false);
    v.stopSpeaking();
    try {
      const res = await fetch('/api/video-notes/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings, history: messagesRef.current, mode: 'summarize' }),
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

  const busy = coachThinking || v.transcribing;

  return (
    <div className="bt-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Coach Mode</h2>
        <VoiceControls v={v} />
      </div>

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
          {v.handsFree ? (
            <p className="text-sm text-neutral-600">
              {v.listening
                ? '🎤 Listening — just talk, I’ll send when you pause.'
                : busy
                  ? 'One moment…'
                  : 'Hands-free is on — I’ll start listening right after I speak.'}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {!v.recording ? (
                <button
                  onClick={toggleMic}
                  disabled={busy}
                  className="rounded bg-lime px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  🎤 Tap to talk
                </button>
              ) : (
                <button
                  onClick={toggleMic}
                  className="rounded bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  ⏹ Stop &amp; send
                </button>
              )}
              {v.transcribing && <span className="text-sm text-neutral-500">Transcribing…</span>}
            </div>
          )}

          <LiveDictation v={v} />

          {/* Where the wait actually goes, so it can be fixed at the slow stage
              instead of the guessed one. Each is a separate round trip today. */}
          {(v.timings.transcribeMs > 0 || replyMs > 0) && (
            <p className="text-xs text-neutral-400">
              {v.timings.transcribeMs > 0 && `heard in ${(v.timings.transcribeMs / 1000).toFixed(1)}s`}
              {replyMs > 0 && ` · reply in ${(replyMs / 1000).toFixed(1)}s`}
              {v.timings.firstAudioMs > 0 &&
                ` · voice in ${(v.timings.firstAudioMs / 1000).toFixed(1)}s`}
            </p>
          )}

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
                <div key={i} className="space-y-3 rounded-lg border border-neutral-300 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Lesson {i + 1}
                    </span>
                    <button
                      onClick={() => removeLesson(i)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-500">Category</span>
                    <input
                      value={l.category}
                      onChange={(e) => updateLesson(i, 'category', e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-500">Title</span>
                    <input
                      value={l.title}
                      onChange={(e) => updateLesson(i, 'title', e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-neutral-500">Guidance</span>
                    <textarea
                      value={l.content}
                      onChange={(e) => updateLesson(i, 'content', e.target.value)}
                      rows={4}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm leading-relaxed"
                    />
                  </label>
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

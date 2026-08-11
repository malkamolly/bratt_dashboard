'use client';

// ============================================================================
// Playbook Manager (admin) — view/edit/deactivate/delete playbook entries
// ============================================================================
// Entries are shown newest-first. Editing an entry opens an optional
// "Refine with Claude" conversation (voice or typed, hands-free supported) so
// you can talk an entry into better shape and apply the result before saving.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import type { RefineMessage } from '@/lib/playbook-refine';
import { fmtDateTime } from '@/lib/format';
import { useCoachVoice, VoiceControls, LiveDictation, type CoachVoice } from '../useCoachVoice';
import { streamReply } from '../streamReply';
import { useStickyScroll } from '../useStickyScroll';

export type AdminPlaybookEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  source: 'library' | 'coach' | 'reference';
  active: boolean;
  created_at: string;
  created_by: string | null;
  /** Display name for created_by (First name + Last initial), set by the page. */
  author: string;
};

const SOURCE_BADGE: Record<AdminPlaybookEntry['source'], string> = {
  library: 'Library',
  coach: 'Coach',
  reference: 'Reference',
};

async function post(body: unknown): Promise<void> {
  const res = await fetch('/api/video-notes/playbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Request failed.');
  }
}

export default function PlaybookManager({
  initialEntries,
}: {
  initialEntries: AdminPlaybookEntry[];
}) {
  // Server sends these newest-first; keep new/edited items in place.
  const [entries, setEntries] = useState<AdminPlaybookEntry[]>(initialEntries);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | AdminPlaybookEntry['source']>('all');
  // Independent of the source filter: 'all', or one author's display name.
  const [author, setAuthor] = useState<string>('all');
  // One shared voice engine — only the row being refined uses it at a time.
  const voice = useCoachVoice();

  function patchLocal(id: string, fields: Partial<AdminPlaybookEntry>) {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...fields } : e)));
  }

  async function toggleActive(entry: AdminPlaybookEntry) {
    const next = !entry.active;
    patchLocal(entry.id, { active: next }); // optimistic
    try {
      await post({ action: 'update', id: entry.id, active: next });
    } catch (err) {
      patchLocal(entry.id, { active: entry.active }); // revert
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    const snapshot = entries;
    setEntries((es) => es.filter((e) => e.id !== id)); // optimistic
    try {
      await post({ action: 'delete', id });
    } catch (err) {
      setEntries(snapshot); // revert
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        The Playbook is empty. Import the Training Library from the Video Notes
        page, or teach the analyzer in Coach Mode.
      </p>
    );
  }

  const libraryCount = entries.filter((e) => e.source === 'library').length;
  const referenceCount = entries.filter((e) => e.source === 'reference').length;
  const coachCount = entries.length - libraryCount - referenceCount;

  // Source filter: 'all' shows everything; otherwise only that source.
  const filters: { key: 'all' | AdminPlaybookEntry['source']; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: entries.length },
    { key: 'coach', label: 'Coach', count: coachCount },
    { key: 'library', label: 'Library', count: libraryCount },
    { key: 'reference', label: 'Reference', count: referenceCount },
  ];

  // Author filter: every distinct contributor, most entries first.
  const authorCounts = new Map<string, number>();
  for (const e of entries) authorCounts.set(e.author, (authorCounts.get(e.author) ?? 0) + 1);
  const authors = [...authorCounts.entries()].sort((a, b) => b[1] - a[1]);

  const visible = entries.filter(
    (e) => (filter === 'all' || e.source === filter) && (author === 'all' || e.author === author),
  );

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === f.key
                ? 'bg-lime text-black'
                : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Only worth showing once more than one person has contributed. */}
      {authors.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Added by
          </span>
          <button
            onClick={() => setAuthor('all')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              author === 'all'
                ? 'bg-neutral-800 text-white'
                : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            Everyone ({entries.length})
          </button>
          {authors.map(([name, count]) => (
            <button
              key={name}
              onClick={() => setAuthor(name)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                author === name
                  ? 'bg-neutral-800 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {name} ({count})
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Showing {visible.length} of {entries.length} — newest first.
      </p>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No entries for this filter.</p>
      ) : (
        visible.map((e) => (
          <PlaybookRow
            key={e.id}
            entry={e}
            voice={voice}
            onToggle={() => toggleActive(e)}
            onSave={async (fields) => {
              patchLocal(e.id, fields);
              try {
                await post({ action: 'update', id: e.id, ...fields });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Save failed.');
              }
            }}
            onDelete={() => remove(e.id)}
          />
        ))
      )}
    </div>
  );
}

function PlaybookRow({
  entry,
  voice,
  onToggle,
  onSave,
  onDelete,
}: {
  entry: AdminPlaybookEntry;
  voice: CoachVoice;
  onToggle: () => void;
  onSave: (fields: Partial<AdminPlaybookEntry>) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(entry.category);
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [saving, setSaving] = useState(false);

  // "Refine with Claude" conversation state
  const [refineOpen, setRefineOpen] = useState(false);
  const [messages, setMessages] = useState<RefineMessage[]>([]);
  const [refineInput, setRefineInput] = useState('');
  const [refineBusy, setRefineBusy] = useState(false);
  const [refineNote, setRefineNote] = useState('');
  const [refineError, setRefineError] = useState('');
  // Lag breakdown, same as Coach Mode — this screen had no visibility at all,
  // which is why several rounds of "nothing changed" had nothing to read.
  const [replyMs, setReplyMs] = useState(0);
  const [streamFellBack, setStreamFellBack] = useState(false);
  const [coachModel, setCoachModel] = useState('');

  const messagesRef = useRef<RefineMessage[]>([]);
  const refineOpenRef = useRef(false);
  const fieldsRef = useRef({ category, title, content });
  useEffect(() => void (messagesRef.current = messages), [messages]);
  useEffect(() => void (refineOpenRef.current = refineOpen), [refineOpen]);
  useEffect(() => {
    fieldsRef.current = { category, title, content };
  }, [category, title, content]);

  async function refinePost(mode: 'chat' | 'apply', history: RefineMessage[]) {
    const res = await fetch('/api/video-notes/playbook/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: fieldsRef.current, history, mode }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed.');
    return json;
  }

  async function refineAsk(history: RefineMessage[]) {
    setRefineBusy(true);
    setRefineError('');
    setRefineNote('');
    setStreamFellBack(false);
    try {
      // Same streaming flow Coach Mode uses — shared so the two can't drift and
      // leave one of them on the slow path again.
      const result = await streamReply({
        url: '/api/video-notes/playbook/refine',
        payload: { entry: fieldsRef.current, history, mode: 'chat' },
        voice,
        onPartial: (text) => setMessages([...history, { role: 'assistant', text }]),
        onFirstText: (ms) => {
          setReplyMs(ms);
          setRefineBusy(false);
        },
      });
      const next: RefineMessage[] = [...history, { role: 'assistant', text: result.reply }];
      setMessages(next);
      messagesRef.current = next;
      setReplyMs(result.replyMs);
      setStreamFellBack(result.fellBack);
      setCoachModel(result.model);
      setRefineBusy(false);
      if (voice.handsFree && refineOpenRef.current) void refineListen();
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Something went wrong.');
      setRefineBusy(false);
    }
  }

  function sendRefine(textIn: string) {
    const t = textIn.trim();
    if (!t) return;
    const next: RefineMessage[] = [...messagesRef.current, { role: 'user', text: t }];
    setMessages(next);
    messagesRef.current = next;
    setRefineInput('');
    refineAsk(next);
  }

  async function refineListen() {
    if (voice.listening) return;
    const heard = await voice.listenOnce();
    if (voice.handsFree && refineOpenRef.current && heard.trim()) sendRefine(heard);
  }

  // Hands-free: when it's the user's turn (nothing said yet, or Claude just
  // replied) and hands-free is on, start listening.
  useEffect(() => {
    if (!refineOpen || !voice.handsFree || refineBusy || voice.listening) return;
    const last = messages[messages.length - 1];
    if (!last || last.role === 'assistant') void refineListen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.handsFree, refineOpen]);

  async function toggleMic() {
    setRefineError('');
    if (voice.recording) {
      const heard = await voice.endRecording();
      if (heard.trim()) sendRefine(heard);
    } else {
      const ok = await voice.beginRecording();
      if (!ok) setRefineError('Could not access the microphone. Type instead.');
    }
  }

  async function applyRefine() {
    setRefineBusy(true);
    setRefineError('');
    try {
      const { entry: refined } = await refinePost('apply', messagesRef.current);
      if (refined) {
        setCategory(refined.category ?? category);
        setTitle(refined.title ?? title);
        setContent(refined.content ?? content);
        setRefineNote("Applied Claude's version — review the fields above and Save.");
      }
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Could not apply.');
    } finally {
      setRefineBusy(false);
    }
  }

  function closeRefine() {
    setRefineOpen(false);
    voice.stopSpeaking();
    voice.setHandsFree(false);
  }

  async function save() {
    setSaving(true);
    await onSave({ category, title, content });
    setSaving(false);
    setEditing(false);
    closeRefine();
  }

  function cancel() {
    setCategory(entry.category);
    setTitle(entry.title);
    setContent(entry.content);
    setEditing(false);
    closeRefine();
    setMessages([]);
    setRefineNote('');
    setRefineError('');
  }

  const refineBusyAll = refineBusy || voice.transcribing;

  // Follow the newest text as it streams in, without fighting a reader who has
  // scrolled up. Same hook Coach Mode uses.
  const thread = useStickyScroll(
    `${messages.length}:${messages[messages.length - 1]?.text.length ?? 0}:${refineBusy}`,
  );

  return (
    <div
      className={`rounded-lg border p-3 ${
        entry.active ? 'border-neutral-300 bg-white' : 'border-neutral-200 bg-neutral-50 opacity-70'
      }`}
    >
      {editing ? (
        <div className="space-y-2">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            placeholder="Category"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            placeholder="Title"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm leading-relaxed"
            placeholder="Guidance"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-lime px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} className="rounded border border-neutral-400 px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button
              onClick={() => (refineOpen ? closeRefine() : setRefineOpen(true))}
              className="rounded border border-neutral-400 px-3 py-1.5 text-sm"
            >
              {refineOpen ? 'Hide refine chat' : '💬 Refine with Claude'}
            </button>
          </div>

          {refineOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs text-neutral-500">
                Talk it through (or type) — Claude has this entry&apos;s wording. When
                you like it, apply Claude&apos;s version into the fields above, then Save.
              </p>
              <VoiceControls v={voice} />
              <div
                ref={thread.ref}
                onScroll={thread.onScroll}
                className="space-y-2 max-h-60 overflow-y-auto"
              >
                {messages.map((m, i) => (
                  <div key={i} className={m.role === 'assistant' ? '' : 'text-right'}>
                    <span
                      className={`inline-block rounded-lg px-2.5 py-1.5 text-sm ${
                        m.role === 'assistant'
                          ? 'bg-white text-neutral-900 border border-neutral-200'
                          : 'bg-lime/60 text-neutral-900'
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                ))}
                {refineBusy && <p className="text-sm text-neutral-500">Thinking…</p>}
              </div>

              {voice.handsFree ? (
                <p className="text-sm text-neutral-600">
                  {voice.listening
                    ? '🎤 Listening — just talk, I’ll send when you pause.'
                    : 'Hands-free on — talk any time.'}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMic}
                    disabled={refineBusyAll}
                    className={`rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                      voice.recording ? 'bg-red-500 text-white' : 'bg-lime text-black'
                    }`}
                  >
                    {voice.recording ? '⏹ Stop & send' : '🎤 Tap to talk'}
                  </button>
                  {voice.transcribing && <span className="text-sm text-neutral-500">Transcribing…</span>}
                </div>
              )}

              <LiveDictation v={voice} />

              {(voice.timings.transcribeMs > 0 || replyMs > 0) && (
                <div className="rounded border border-neutral-300 bg-white/70 px-2 py-1 font-mono text-xs text-neutral-700">
                  <span className="font-semibold">Timing:</span>{' '}
                  {voice.timings.transcribeMs > 0 &&
                    `heard ${(voice.timings.transcribeMs / 1000).toFixed(1)}s`}
                  {replyMs > 0 && ` · reply ${(replyMs / 1000).toFixed(1)}s`}
                  {voice.timings.firstAudioMs > 0 &&
                    ` · voice ${(voice.timings.firstAudioMs / 1000).toFixed(1)}s`}
                  {streamFellBack && ' · STREAM FELL BACK'}
                  {coachModel && ` · ${coachModel}`}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={refineInput}
                  onChange={(e) => setRefineInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendRefine(refineInput)}
                  disabled={refineBusyAll}
                  placeholder="e.g. make this specific to bur oak"
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => sendRefine(refineInput)}
                  disabled={refineBusyAll || !refineInput.trim()}
                  className="rounded border border-neutral-400 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={applyRefine}
                  disabled={refineBusyAll}
                  className="rounded bg-lime px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
                >
                  Apply Claude&apos;s version to the fields
                </button>
              )}
              {refineNote && <p className="text-sm text-green-700">{refineNote}</p>}
              {refineError && <p className="text-sm text-red-600">{refineError}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {entry.category}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    entry.source === 'coach'
                      ? 'bg-lime/60 text-neutral-800'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {SOURCE_BADGE[entry.source]}
                </span>
                <span
                  className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-600"
                  title={entry.created_by ?? 'Unknown'}
                >
                  {entry.author}
                </span>
                {/* When this entry was committed. Entries are already ordered
                    newest-first, so this makes that ordering legible. */}
                <span className="text-[10px] text-neutral-500" title={entry.created_at}>
                  {fmtDateTime(entry.created_at)}
                </span>
              </div>
              <p className="font-medium text-sm">{entry.title}</p>
            </div>
            <div className="flex shrink-0 gap-3 text-xs">
              <button onClick={onToggle} className="text-neutral-600 hover:underline">
                {entry.active ? 'Turn off' : 'Turn on'}
              </button>
              <button onClick={() => setEditing(true)} className="text-neutral-600 hover:underline">
                Edit
              </button>
              <button onClick={onDelete} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </div>
          <p className="text-sm text-neutral-800">{entry.content}</p>
        </div>
      )}
    </div>
  );
}

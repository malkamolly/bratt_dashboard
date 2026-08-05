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
import { useCoachVoice, VoiceControls, type CoachVoice } from '../useCoachVoice';

export type AdminPlaybookEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  source: 'library' | 'coach' | 'reference';
  active: boolean;
  created_at: string;
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

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-neutral-500">
        {entries.length} entries ({coachCount} from Coach, {libraryCount} from
        Library, {referenceCount} from Reference PDFs) — newest first.
      </p>
      {entries.map((e) => (
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
      ))}
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
    try {
      const { reply } = await refinePost('chat', history);
      const next: RefineMessage[] = [...history, { role: 'assistant', text: reply || '' }];
      setMessages(next);
      messagesRef.current = next;
      setRefineBusy(false);
      await voice.speak(reply || '');
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
              <div className="space-y-2 max-h-60 overflow-y-auto">
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

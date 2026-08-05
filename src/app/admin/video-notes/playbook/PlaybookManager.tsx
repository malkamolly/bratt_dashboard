'use client';

// ============================================================================
// Playbook Manager (admin) — view/edit/deactivate/delete playbook entries
// ============================================================================
// Entries are shown newest-first. Editing an entry opens an optional
// "Refine with Claude" conversation so you can talk an entry into better shape
// and apply the result back into the fields before saving.
// ============================================================================

import { useState } from 'react';
import type { RefineMessage } from '@/lib/playbook-refine';

export type AdminPlaybookEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  source: 'library' | 'coach';
  active: boolean;
  created_at: string;
};

const SOURCE_BADGE: Record<AdminPlaybookEntry['source'], string> = {
  library: 'Library',
  coach: 'Coach',
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
  const coachCount = entries.length - libraryCount;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-neutral-500">
        {entries.length} entries ({coachCount} from Coach, {libraryCount} from
        Library) — newest first.
      </p>
      {entries.map((e) => (
        <PlaybookRow
          key={e.id}
          entry={e}
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
  onToggle,
  onSave,
  onDelete,
}: {
  entry: AdminPlaybookEntry;
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

  async function refinePost(mode: 'chat' | 'apply', history: RefineMessage[]) {
    const res = await fetch('/api/video-notes/playbook/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: { category, title, content }, history, mode }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed.');
    return json;
  }

  async function sendRefine() {
    const t = refineInput.trim();
    if (!t) return;
    const next: RefineMessage[] = [...messages, { role: 'user', text: t }];
    setMessages(next);
    setRefineInput('');
    setRefineBusy(true);
    setRefineError('');
    setRefineNote('');
    try {
      const { reply } = await refinePost('chat', next);
      setMessages([...next, { role: 'assistant', text: reply || '' }]);
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRefineBusy(false);
    }
  }

  async function applyRefine() {
    setRefineBusy(true);
    setRefineError('');
    try {
      const { entry: refined } = await refinePost('apply', messages);
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

  async function save() {
    setSaving(true);
    await onSave({ category, title, content });
    setSaving(false);
    setEditing(false);
    setRefineOpen(false);
  }

  function cancel() {
    setCategory(entry.category);
    setTitle(entry.title);
    setContent(entry.content);
    setEditing(false);
    setRefineOpen(false);
    setMessages([]);
    setRefineNote('');
    setRefineError('');
  }

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
              onClick={() => setRefineOpen((o) => !o)}
              className="rounded border border-neutral-400 px-3 py-1.5 text-sm"
            >
              {refineOpen ? 'Hide refine chat' : '💬 Refine with Claude'}
            </button>
          </div>

          {refineOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs text-neutral-500">
                Talk through this entry — Claude has its current wording. When you
                like where it&apos;s headed, apply Claude&apos;s version into the
                fields above, then Save.
              </p>
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
              <div className="flex gap-2">
                <input
                  value={refineInput}
                  onChange={(e) => setRefineInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendRefine()}
                  disabled={refineBusy}
                  placeholder="e.g. make this specific to bur oak"
                  className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={sendRefine}
                  disabled={refineBusy || !refineInput.trim()}
                  className="rounded border border-neutral-400 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={applyRefine}
                  disabled={refineBusy}
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

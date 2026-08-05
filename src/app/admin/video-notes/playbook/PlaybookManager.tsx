'use client';

// ============================================================================
// Playbook Manager (admin) — view/edit/deactivate/delete playbook entries
// ============================================================================

import { useState } from 'react';

export type AdminPlaybookEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  source: 'library' | 'coach';
  active: boolean;
};

const SOURCE_LABEL: Record<AdminPlaybookEntry['source'], string> = {
  library: 'From the Training Library',
  coach: 'From Coach Mode',
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

  const bySource = (source: AdminPlaybookEntry['source']) =>
    entries.filter((e) => e.source === source);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        The Playbook is empty. Import the Training Library from the Video Notes
        page, or teach the analyzer in Coach Mode.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {(['library', 'coach'] as const).map((source) => {
        const list = bySource(source);
        if (list.length === 0) return null;
        return (
          <section key={source}>
            <h2 className="font-semibold mb-1">{SOURCE_LABEL[source]}</h2>
            <p className="text-xs text-neutral-500 mb-3">
              {list.filter((e) => e.active).length} active of {list.length}
            </p>
            <div className="space-y-3">
              {list.map((e) => (
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
          </section>
        );
      })}
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

  async function save() {
    setSaving(true);
    await onSave({ category, title, content });
    setSaving(false);
    setEditing(false);
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
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-lime px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setCategory(entry.category);
                setTitle(entry.title);
                setContent(entry.content);
                setEditing(false);
              }}
              className="rounded border border-neutral-400 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {entry.category}
              </span>
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

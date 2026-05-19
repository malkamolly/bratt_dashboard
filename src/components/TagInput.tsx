'use client';

import { useMemo, useRef, useState } from 'react';

type Props = {
  /** Initial tags (when editing) */
  defaultValue?: string[];
  /** Tags already used across the site — drives the autocomplete suggestions */
  knownTags?: string[];
  /** Hidden form field name. Tags are submitted as a single comma-separated value. */
  name: string;
  id?: string;
};

export function TagInput({ defaultValue = [], knownTags = [], name, id }: Props) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const draftLower = draft.trim().toLowerCase();
    if (!draftLower) return [] as string[];
    return knownTags
      .filter(
        (t) =>
          t.toLowerCase().includes(draftLower) &&
          !tags.some((existing) => existing.toLowerCase() === t.toLowerCase()),
      )
      .slice(0, 5);
  }, [draft, knownTags, tags]);

  function addTag(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('');
      return;
    }
    setTags([...tags, trimmed]);
    setDraft('');
    inputRef.current?.focus();
  }

  function removeTag(idx: number) {
    setTags(tags.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={tags.join(', ')} />
      <div className="flex flex-wrap items-center gap-2 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 focus-within:border-orange">
        {tags.map((t, i) => (
          <span
            key={t + i}
            className="inline-flex items-center gap-1 rounded-full bg-bark px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-cream"
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="ml-1 text-cream/70 hover:text-orange"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={tags.length === 0 ? 'Type a tag, hit Enter…' : ''}
          className="flex-1 min-w-[8rem] bg-transparent text-sm focus:outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => addTag(s)}
                className="rounded-full border-2 border-paper-edge bg-white px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 hover:border-orange hover:text-orange"
              >
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

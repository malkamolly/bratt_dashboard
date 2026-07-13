'use client';

// ============================================================================
// SOP editor — edit title, category, and content in Markdown, with a live
// preview. Markdown is the editable source; on save the server regenerates the
// reading HTML and the search/AI text from it.
// ============================================================================

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Save } from 'lucide-react';
import { saveSopContent } from '../../actions';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="bt-btn bt-btn-primary" disabled={pending}>
      <Save className="h-4 w-4" />
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export function SopEditor({
  id,
  title,
  category,
  markdown,
  categories,
}: {
  id: string;
  title: string;
  category: string | null;
  markdown: string;
  categories: string[];
}) {
  const [md, setMd] = useState(markdown);

  return (
    <form action={saveSopContent} className="mt-6">
      <input type="hidden" name="id" value={id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Title</span>
          <input
            type="text"
            name="title"
            defaultValue={title}
            required
            className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Category</span>
          <input
            type="text"
            name="category"
            defaultValue={category ?? ''}
            list="sop-categories"
            placeholder="e.g. Dispatch, Billing, HR"
            className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-sm"
          />
          <datalist id="sop-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      {/* Editor + live preview side by side */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Content (Markdown)
            </span>
          </div>
          <textarea
            name="body_markdown"
            value={md}
            onChange={(e) => setMd(e.target.value)}
            spellCheck
            className="min-h-[28rem] w-full flex-1 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-mono text-sm leading-relaxed"
          />
          <p className="mt-2 text-xs text-fg-3">
            Use <code>## Heading</code> for each section (these become the
            cards), <code>- item</code> for bullets, <code>1. item</code> for
            numbered steps, and <code>**bold**</code> for emphasis.
          </p>
        </div>

        <div className="flex flex-col">
          <span className="mb-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Preview
          </span>
          <div className="min-h-[28rem] flex-1 overflow-auto rounded-2 border-2 border-paper-edge bg-white px-5 py-4">
            {md.trim() ? (
              <div className="sop-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-fg-3">Nothing to preview yet.</p>
            )}
          </div>
          <p className="mt-2 text-xs text-fg-3">
            This is a quick preview. Save to see the final card layout.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <SaveButton />
        <Link href={`/sops/${id}`} className="bt-btn bt-btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}

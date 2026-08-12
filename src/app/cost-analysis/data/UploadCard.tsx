'use client';

// Spreadsheet upload for the Add & Review Jobs page.
//
// Client-side only so the button can show progress — parsing a year of line items
// takes a moment, and a form that looks dead invites a second click (and a second
// import). The actual work all happens in importSpreadsheet on the server.

import { useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { importSpreadsheet } from './actions';

function SubmitButton({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !hasFile}
      className="rounded-card border-[3px] border-orange bg-orange px-6 py-2.5 font-headline text-sm font-black uppercase tracking-wide text-white transition-colors hover:bg-bark-deep disabled:cursor-not-allowed disabled:border-bark/20 disabled:bg-bark/20 disabled:text-fg-3"
    >
      {pending ? 'Reading the spreadsheet…' : 'Upload to pending'}
    </button>
  );
}

export default function UploadCard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    // Deliberately quiet: one person does the bulk uploads, so when closed this is
    // just a small grey line — no card, no keyline, nothing competing with the form
    // above or the queue below. The panel only appears once it's opened.
    <details className="group mt-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg-3 hover:text-orange [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">&#9656;</span>
        Upload a spreadsheet
      </summary>

      <div className="mt-3 rounded-card border-2 border-bark/15 bg-white/50 p-5">
        {/* The Hub's Date Type setting is load-bearing — Creation Date silently
            returns a fraction of the jobs — so it leads once this is open. */}
        <p className="max-w-3xl text-sm text-fg-2">
          In the Hub, run <strong>Invoice Items</strong> with{' '}
          <strong>Date Type = Completion Date</strong> starting on or after your last upload, then
          drop the <code>.xlsx</code> here.
        </p>

        <form action={importSpreadsheet} className="mt-4 flex flex-wrap items-center gap-4">
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".xlsx,.xlsm,.csv"
            // No `required` here: the input is hidden, and Chrome refuses to submit
            // a form with an invalid control it can't focus. The disabled submit
            // button is what guarantees a file was chosen.
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-card border-2 border-bark/30 bg-white px-5 py-2.5 font-headline text-sm font-black uppercase tracking-wide text-bark-deep transition-colors hover:border-orange hover:text-orange"
          >
            Choose file
          </button>
          <span className="min-w-0 flex-1 truncate text-sm text-fg-2">
            {fileName ?? <span className="text-fg-3">No file chosen — .xlsx or .csv</span>}
          </span>
          <SubmitButton hasFile={!!fileName} />
        </form>

        {/* Plain text rather than a nested disclosure: you've already opened one
            to get here, and nested Tailwind `group`s would cross their arrows. */}
        <p className="mt-4 max-w-3xl text-sm text-fg-3">
          DBH, height, crown spread, species and tree count are pulled out of each line
          item&rsquo;s description text, since the Hub doesn&rsquo;t export them as columns.
          Anything unreadable is left blank and noted on the row rather than guessed at, and a
          job described as several trees or a multi-stem clump is recorded with its trunk count
          &mdash; which keeps it out of the pricing math but still counted in the totals.
          Re-uploading an overlapping date range is safe: jobs already in the system are skipped.
        </p>
      </div>
    </details>
  );
}

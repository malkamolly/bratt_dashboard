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
    <section className="bt-card mt-8">
      <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
        Upload a spreadsheet
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-fg-2">
        Drops a whole batch of completed removals in at once. In the Hub, run{' '}
        <strong>Invoice Items</strong> with <strong>Date Type = Completion Date</strong> and a start
        date on or after your last upload, then drop the <code>.xlsx</code> here. Every job lands in{' '}
        <strong>Pending</strong> below — nothing touches the numbers until you include it.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-fg-3">
        DBH, height, crown spread, species and tree count are read out of each line
        item&rsquo;s description text. Anything unreadable is left blank and noted rather than
        guessed, and re-uploading an overlapping date range is safe &mdash; jobs already in the
        system are skipped.
      </p>

      <form action={importSpreadsheet} className="mt-5 flex flex-wrap items-center gap-4">
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
    </section>
  );
}

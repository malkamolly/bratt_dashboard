'use client';

import { useState } from 'react';
import { deleteMeeting } from '@/app/hub/meetings/actions';

export function DeleteMeetingButton({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  // Two-step confirm: the first click flips into a confirmation state with
  // the meeting title spelled out, and only the second click actually
  // submits the form. Replaces window.confirm, which gets swallowed on
  // mobile and can be bypassed by some React server-action submit paths.
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press hover:underline"
      >
        Delete meeting
      </button>
    );
  }

  return (
    <form action={deleteMeeting} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
        Delete <span className="text-orange-press">&ldquo;{title}&rdquo;</span>?
        This can&rsquo;t be undone.
      </p>
      <button
        type="submit"
        className="rounded-full bg-orange-press px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream hover:bg-orange"
      >
        Yes, delete it
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2 hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

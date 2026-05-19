'use client';

import { deleteMeeting } from '@/app/hub/meetings/actions';

export function DeleteMeetingButton({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  return (
    <form
      action={deleteMeeting}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete "${title}"?\n\nThis can't be undone. Type-cast it back if you change your mind.`,
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange-press hover:underline"
      >
        Delete meeting
      </button>
    </form>
  );
}

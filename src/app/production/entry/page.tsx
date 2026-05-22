import { redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { getAllowedUser } from '@/lib/auth';
import {
  loadProductionEntriesForDate,
  loadProductionEntryAuditForDate,
} from '@/lib/production-data';
import { toIsoDate, fromIsoDate, isWeekend } from '@/lib/dates';
import { EntryForm } from './EntryForm';

type SearchParams = Promise<{ date?: string; saved?: string }>;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export default async function ProductionEntryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  const params = await searchParams;
  const today = toIsoDate(new Date());
  const date =
    params.date && isValidIsoDate(params.date) ? params.date : today;

  const { crews, members, memberEntries, crewEntries } =
    await loadProductionEntriesForDate(date);

  const audit =
    user.role === 'admin'
      ? await loadProductionEntryAuditForDate(date)
      : null;

  const d = fromIsoDate(date);
  const dayLabel = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const weekend = isWeekend(d);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">Production</p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        Daily Entry
      </h1>
      <p className="mt-3 text-fg-2">
        Entering for <strong className="text-ink">{dayLabel}</strong>
        {weekend && (
          <span className="ml-2 inline-block rounded-full bg-status-warn/30 px-2 py-0.5 text-xs font-bold uppercase tracking-ribbon text-fg-1">
            Weekend
          </span>
        )}
      </p>
      {audit && (
        <p className="mt-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          Last saved by {audit.savedBy} ·{' '}
          {format(parseISO(audit.savedAt), 'MMM d, yyyy h:mm a')}
        </p>
      )}

      <div className="mt-8">
        <EntryForm
          key={date}
          date={date}
          crews={crews}
          members={members}
          initialMemberEntries={memberEntries}
          initialCrewEntries={crewEntries}
        />
      </div>
    </main>
  );
}

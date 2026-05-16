import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { loadSalesEntriesForDate } from '@/lib/sales-data';
import { toIsoDate, fromIsoDate, isWeekend } from '@/lib/dates';
import { EntryForm } from './EntryForm';

type SearchParams = Promise<{ date?: string; saved?: string }>;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export default async function SalesEntryPage({
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

  const { salespeople, entriesByPerson } = await loadSalesEntriesForDate(date);

  const dateObj = fromIsoDate(date);
  const dayLabel = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const weekend = isWeekend(dateObj);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">Sales</p>
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

      <div className="mt-8">
        <EntryForm
          date={date}
          salespeople={salespeople}
          initialAmounts={entriesByPerson}
        />
      </div>
    </main>
  );
}

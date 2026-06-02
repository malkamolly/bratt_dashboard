'use client';

// ============================================================================
// DayPicker — prev/next + native date input that navigates the page
// ============================================================================
// Drives the Forecast vs Actual page off a `?date=` query param. Stepping is
// by calendar day; the date input lets you jump anywhere. Mirrors the date
// controls on the Tomorrow's Schedule form so it feels familiar.
// ============================================================================

import { useRouter } from 'next/navigation';
import { fromIsoDate, toIsoDate } from '@/lib/dates';

export function DayPicker({ date }: { date: string }) {
  const router = useRouter();

  const go = (iso: string) => router.push(`/schedule/accuracy?date=${iso}`);

  const shift = (delta: number) => {
    const d = fromIsoDate(date);
    d.setDate(d.getDate() + delta);
    go(toIsoDate(d));
  };

  const arrow =
    'rounded-md border-2 border-ink/20 bg-white px-3 py-2 font-headline text-sm hover:border-orange';

  return (
    <div className="flex items-center gap-2" data-screenshot-ignore="true">
      <button type="button" onClick={() => shift(-1)} className={arrow} aria-label="Previous day">
        ←
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => {
          if (e.target.value) go(e.target.value);
        }}
        className="rounded-md border-2 border-ink/20 bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
      />
      <button type="button" onClick={() => shift(1)} className={arrow} aria-label="Next day">
        →
      </button>
    </div>
  );
}

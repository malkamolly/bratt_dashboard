'use client';

import { useRouter, usePathname } from 'next/navigation';

type Props = {
  year: number;
  month: number; // 1-12
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthPicker({ year, month }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function go(deltaMonths: number) {
    const d = new Date(year, month - 1 + deltaMonths, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    router.push(`${pathname}?year=${y}&month=${m}`);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous month"
        className="rounded-full border-2 border-paper-edge bg-white px-3 py-1 font-headline text-sm font-extrabold text-ink hover:border-orange"
      >
        ←
      </button>
      <span className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-1">
        {MONTHS[month - 1]} {year}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next month"
        className="rounded-full border-2 border-paper-edge bg-white px-3 py-1 font-headline text-sm font-extrabold text-ink hover:border-orange"
      >
        →
      </button>
    </div>
  );
}

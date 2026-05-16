import Link from 'next/link';

type Props = {
  year: number;
  month: number; // 1-12
  /** Path the picker should navigate within. Defaults to the current page. */
  basePath?: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Server-rendered month picker. Uses plain <Link>s so no client JS is
 * required to navigate - the prev/next URLs are computed at render time.
 */
export function MonthPicker({ year, month, basePath }: Props) {
  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const prevQuery = `year=${prev.getFullYear()}&month=${prev.getMonth() + 1}`;
  const nextQuery = `year=${next.getFullYear()}&month=${next.getMonth() + 1}`;
  const prevHref = basePath ? `${basePath}?${prevQuery}` : `?${prevQuery}`;
  const nextHref = basePath ? `${basePath}?${nextQuery}` : `?${nextQuery}`;

  const arrow =
    'inline-flex h-7 w-7 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-lime hover:text-ink';

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-bark px-3 py-1.5 text-cream shadow-sh-1">
      <Link href={prevHref} aria-label="Previous month" className={arrow}>
        ←
      </Link>
      <span className="min-w-[6.5rem] text-center font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream">
        {MONTHS[month - 1]} {year}
      </span>
      <Link href={nextHref} aria-label="Next month" className={arrow}>
        →
      </Link>
    </div>
  );
}

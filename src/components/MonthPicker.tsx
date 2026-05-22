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
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Server-rendered month picker. Three controls:
 *   - left arrow: previous month
 *   - centre label: click to open a 12-month grid for the current year
 *   - right arrow: next month
 *
 * All navigation is via plain <Link>s. The centre dropdown uses native
 * <details>/<summary> so no client JS is required.
 */
export function MonthPicker({ year, month, basePath }: Props) {
  const href = (y: number, m: number) => {
    const q = `year=${y}&month=${m}`;
    return basePath ? `${basePath}?${q}` : `?${q}`;
  };

  const prev = new Date(year, month - 2, 1);
  const next = new Date(year, month, 1);
  const prevHref = href(prev.getFullYear(), prev.getMonth() + 1);
  const nextHref = href(next.getFullYear(), next.getMonth() + 1);

  const arrow =
    'inline-flex h-7 w-7 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-lime hover:text-ink';

  return (
    <div className="relative inline-flex items-center gap-1 rounded-full bg-bark px-2 py-1.5 text-cream shadow-sh-1">
      <Link href={prevHref} aria-label="Previous month" className={arrow}>
        ←
      </Link>

      <details className="group relative">
        <summary className="flex min-w-[7rem] cursor-pointer list-none items-center justify-center gap-1 px-1 text-center font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream hover:text-lime [&::-webkit-details-marker]:hidden">
          <span>{MONTHS[month - 1]} {year}</span>
          <span aria-hidden className="text-cream/60">▾</span>
        </summary>

        <div
          data-html2canvas-ignore="true"
          className="absolute left-1/2 z-50 mt-3 w-56 -translate-x-1/2 rounded-card border-[3px] border-bark bg-cream p-3 shadow-sh-3"
        >
          <p className="mb-2 text-center font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Jump to month — {year}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {SHORT.map((m, i) => {
              const isActive = i + 1 === month;
              return (
                <Link
                  key={m}
                  href={href(year, i + 1)}
                  className={
                    isActive
                      ? 'rounded-2 bg-orange px-2 py-1.5 text-center font-headline text-xs font-extrabold uppercase tracking-ribbon text-white'
                      : 'rounded-2 px-2 py-1.5 text-center font-headline text-xs font-extrabold uppercase tracking-ribbon text-ink hover:bg-bark hover:text-cream'
                  }
                >
                  {m}
                </Link>
              );
            })}
          </div>
        </div>
      </details>

      <Link href={nextHref} aria-label="Next month" className={arrow}>
        →
      </Link>
    </div>
  );
}

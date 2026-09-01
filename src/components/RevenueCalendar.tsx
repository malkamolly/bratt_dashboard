// ============================================================================
// The month grid — scheduled revenue, one square per day
// ============================================================================
// Server-rendered, no client JavaScript. Every control is a plain <Link>, so
// the whole thing works on a phone in a truck with a bad signal, and the URL is
// the state — a month + filter + open day can be pasted into Slack and land
// someone on exactly what you were looking at.
//
// WHAT A SQUARE SHOWS — three lines, in this order:
//   TREE WORK   biggest and boldest. It's the number the schedule is built
//               around, and the one people are looking for.
//   PHC         its own line, because Plant Health Care runs on its own techs
//               and trucks — a $30k tree day and a $30k PHC day are completely
//               different days to whoever is staffing them.
//   TOTAL       the two added up, under a rule.
// The PHC line is drawn even when it's empty, so the three lines land in the
// same place on every square and the grid can be scanned down a column.
//
// Work waiting on a customer's approval is a footnote on the square, never part
// of any of the three. See the pile notes in lib/scheduled-revenue.ts for why.
//
// The shading is a heat map against the busiest day IN THIS MONTH, not against
// the year. A quiet February would otherwise render as a uniformly blank grid
// and tell you nothing about which of its days are the heavy ones.
// ============================================================================

import Link from 'next/link';
import {
  UNIT_COLORS,
  UNIT_ORDER,
  UNIT_LABELS,
  treeTotal,
  phcTotal,
  type BusinessUnit,
  type DayTotals,
} from '@/lib/scheduled-revenue';
import { fmtUsd } from '@/lib/format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Money at a glance: "$33.8k", "$1.2M", "$850".
 *
 * A calendar square is about 90px wide, and "$33,787.96" either wraps or
 * shrinks to unreadable. The exact figure is one click away in the day detail,
 * and on the month summary above the grid.
 */
export function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (abs >= 1_000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

/** Days in a month, and which weekday it starts on (Monday = 0). */
function monthShape(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay is Sunday-based; the crews' week starts Monday.
  const lead = (first.getUTCDay() + 6) % 7;
  return { dayCount, lead };
}

function iso(year: number, month: number, day: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
}

export function RevenueCalendar({
  year,
  month,
  days,
  unit,
  today,
  selectedDay,
  hrefForDay,
}: {
  year: number;
  month: number; // 1-12
  /** Keyed by ISO day. Days with nothing on them are simply absent. */
  days: Map<string, DayTotals>;
  /** null = all units. Filters the figure on each square. */
  unit: BusinessUnit | null;
  today: string;
  selectedDay: string | null;
  hrefForDay: (day: string | null) => string;
}) {
  const { dayCount, lead } = monthShape(year, month);

  // Under a unit filter the square shows that one unit and nothing else — a
  // tree/PHC split is meaningless when you've already picked one of them.
  const valueOf = (d: DayTotals | undefined): number => {
    if (!d) return 0;
    return unit ? d.byUnit[unit] : d.firmRevenue;
  };
  const jobsOf = (d: DayTotals | undefined): number => {
    if (!d) return 0;
    return unit ? (d.jobsByUnit?.[unit] ?? 0) : d.firmJobs;
  };

  // The heat scale: busiest day in THIS month.
  let peak = 0;
  for (let d = 1; d <= dayCount; d++) {
    peak = Math.max(peak, valueOf(days.get(iso(year, month, d))));
  }

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push(<div key={`pad-${i}`} className="hidden sm:block" />);
  }

  for (let d = 1; d <= dayCount; d++) {
    const key = iso(year, month, d);
    const totals = days.get(key);
    const value = valueOf(totals);
    const jobs = jobsOf(totals);
    const tree = treeTotal(totals?.byUnit);
    const phc = phcTotal(totals?.byUnit);
    const hold = totals?.holdRevenue ?? 0;
    const isToday = key === today;
    const isPast = key < today;
    const isSelected = key === selectedDay;
    const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const empty = value === 0 && jobs === 0 && hold === 0;

    // Lime wash, deepening with the day's share of the month's peak. Capped at
    // 0.85 so the day number stays readable on the heaviest square.
    const heat = peak > 0 && value > 0 ? Math.min(0.85, 0.12 + (value / peak) * 0.73) : 0;

    cells.push(
      <Link
        key={key}
        href={hrefForDay(isSelected ? null : key)}
        scroll={false}
        aria-current={isToday ? 'date' : undefined}
        className={[
          'group relative flex min-h-[6.75rem] flex-col rounded-2 border-2 p-1.5 transition-colors',
          isSelected
            ? 'border-orange ring-2 ring-orange/30'
            : isToday
              ? 'border-ink'
              : 'border-paper-edge hover:border-orange',
          isWeekend && empty ? 'bg-paper/50' : 'bg-white',
          isPast && !isToday ? 'opacity-60' : '',
        ].join(' ')}
      >
        {heat > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[6px]"
            style={{ backgroundColor: `rgba(233, 231, 29, ${heat})` }}
          />
        )}
        <span className="relative flex items-baseline justify-between">
          <span
            className={`font-headline text-[11px] font-extrabold ${
              isToday ? 'rounded-full bg-ink px-1.5 py-0.5 text-cream' : 'text-fg-3'
            }`}
          >
            {d}
          </span>
          <span className="font-headline text-[9px] font-extrabold uppercase tracking-wider text-fg-3 sm:hidden">
            {WEEKDAYS[(weekday + 6) % 7]}
          </span>
        </span>

        <span className="relative mt-auto block">
          {empty ? (
            <span className="block font-headline text-sm font-black leading-tight text-fg-3/50">
              —
            </span>
          ) : unit ? (
            <>
              <span className="block font-headline text-sm font-black leading-tight text-ink">
                {compactUsd(value)}
              </span>
              <span className="block text-[10px] leading-tight text-fg-2">
                {UNIT_LABELS[unit]} · {jobs} {jobs === 1 ? 'job' : 'jobs'}
              </span>
            </>
          ) : (
            <>
              <span className="block font-headline text-[15px] font-black leading-tight text-ink">
                {compactUsd(tree)}
              </span>
              <span className="block text-[10px] leading-tight text-teal-navy">
                PHC {compactUsd(phc)}
              </span>
              <span className="mt-0.5 block border-t border-ink/20 pt-0.5 font-headline text-[11px] font-extrabold leading-tight text-fg-2">
                {compactUsd(value)}
                {jobs > 0 && (
                  <span className="font-normal text-fg-3"> · {jobs}</span>
                )}
              </span>
            </>
          )}
          {hold > 0 && (
            <span className="block text-[10px] leading-tight text-fg-3">
              +{compactUsd(hold)} waiting
            </span>
          )}
        </span>
      </Link>,
    );
  }

  return (
    <div>
      <div className="mb-1 hidden grid-cols-7 gap-1 sm:grid">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="pb-1 text-center font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-7">{cells}</div>
    </div>
  );
}

/** The month's firm revenue split by business unit, as one stacked bar. */
export function UnitSplitBar({
  byUnit,
  className = '',
}: {
  byUnit: Record<BusinessUnit, number>;
  className?: string;
}) {
  const rows = UNIT_ORDER.map((u) => ({ unit: u, value: byUnit[u] ?? 0 })).filter(
    (r) => r.value > 0,
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return null;

  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full border-2 border-ink">
        {rows.map((r) => (
          <div
            key={r.unit}
            style={{
              width: `${(r.value / total) * 100}%`,
              backgroundColor: UNIT_COLORS[r.unit],
            }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => (
          <li key={r.unit} className="text-xs">
            <span
              className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ backgroundColor: UNIT_COLORS[r.unit] }}
            />
            <span className="font-headline font-extrabold uppercase tracking-ribbon text-fg-2">
              {UNIT_SHORT_LABEL[r.unit]}
            </span>{' '}
            <strong className="font-headline font-black text-ink">
              {fmtUsd(r.value)}
            </strong>{' '}
            <span className="text-fg-3">
              ({Math.round((r.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend labels. PHC is spelled short here because the bar is tight; the tiles
 *  and filters use the full UNIT_LABELS. */
const UNIT_SHORT_LABEL: Record<BusinessUnit, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  municipal: 'Municipal',
  phc: 'PHC',
  other: 'Other',
};

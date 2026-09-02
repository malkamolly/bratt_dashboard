'use client';

// ============================================================================
// The month you're looking at — switched in the browser, not on the server
// ============================================================================
// WHY THIS IS A CLIENT COMPONENT AT ALL, on a page that is otherwise entirely
// server-rendered.
//
// Stepping a month used to be a real navigation: a round trip to the server, a
// fresh Supabase read of the whole snapshot, and a jump back to the top of the
// page. Flipping through six months to see how autumn is filling up meant six
// pauses and six scrolls back down. That's the one interaction on this page
// people repeat, so it's the one worth spending a bundle on.
//
// The whole snapshot is already loaded when the page renders, so every month is
// sitting in memory — switching is a state change, not a fetch.
//
// WHAT STAYS ON THE SERVER: everything else. The tiles, the pile cards, the job
// lists, the outlook. They render once and never re-render, so they cost no
// JavaScript.
//
// THE URL STILL FOLLOWS ALONG, via history.replaceState rather than the router:
// a router call would put the round trip straight back. So a link you copy
// after flipping to November opens on November, and the page stays shareable.
// The one thing this can't reach is the hrefs the server already rendered — the
// pile cards below carry the month the page loaded with. They open lists that
// aren't month-scoped, so the cost is landing back on that month when you close
// one.
// ============================================================================

import { useMemo, useState } from 'react';
import {
  UNIT_LABELS,
  workTotal,
  type DayTotals,
  type MonthTotals,
} from '@/lib/scheduled-revenue';
import { RevenueCalendar, UnitSplitBar } from '@/components/RevenueCalendar';
import { fmtUsd, monthLabel } from '@/lib/format';
import { linkTo, type Nav } from './nav';

export function MonthBrowser({
  nav,
  days,
  months,
  today,
  children,
}: {
  nav: Nav;
  /** An array, not a Map: this crosses the server/client boundary. */
  days: DayTotals[];
  months: MonthTotals[];
  today: string;
  /** The open-day panel, rendered on the server and passed through. Hidden
   *  once you leave the month it belongs to. */
  children?: React.ReactNode;
}) {
  const [ym, setYm] = useState({ year: nav.year, month: nav.month });
  const { unit } = nav;

  const dayMap = useMemo(
    () => new Map(days.map((d) => [d.date, d])),
    [days],
  );

  const monthKey = `${ym.year}-${String(ym.month).padStart(2, '0')}`;
  const thisMonth = months.find((m) => m.month === monthKey);

  // The day panel belongs to the month it was opened from. Step away and it
  // stops making sense, so it goes — which is what a real navigation used to do.
  const onOriginalMonth = ym.year === nav.year && ym.month === nav.month;

  function goto(year: number, month: number) {
    setYm({ year, month });
    // replaceState, not the router: the router would re-run the server render
    // and we would be back where we started.
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        null,
        '',
        linkTo(nav, { year, month, day: null }),
      );
    }
  }

  const step = (delta: number) => {
    const d = new Date(Date.UTC(ym.year, ym.month - 1 + delta, 1));
    goto(d.getUTCFullYear(), d.getUTCMonth() + 1);
  };

  const arrow =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-lime hover:text-ink';

  return (
    <>
      <section className="mt-6 rounded-card border-[3px] border-paper-edge bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 rounded-full bg-bark px-2 py-1.5 text-cream shadow-sh-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className={arrow}
            >
              ←
            </button>
            <span className="min-w-[9rem] px-1 text-center font-headline text-xs font-extrabold uppercase tracking-ribbon">
              {monthLabel(ym.year, ym.month)}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className={arrow}
            >
              →
            </button>
          </div>

          <div className="text-right">
            <p className="font-headline text-3xl font-black text-ink">
              {fmtUsd(
                unit ? (thisMonth?.byUnit[unit] ?? 0) : (thisMonth?.firmRevenue ?? 0),
              )}
            </p>
            <p className="text-xs text-fg-2">
              {thisMonth ? (
                <>
                  {unit ? (thisMonth.jobsByUnit?.[unit] ?? 0) : thisMonth.firmJobs}{' '}
                  jobs across {thisMonth.workingDays} working days
                  {!unit && (
                    <>
                      {' '}
                      · {fmtUsd(workTotal(thisMonth.byWork, 'tree'))} tree ·{' '}
                      {fmtUsd(workTotal(thisMonth.byWork, 'phc'))} PHC ·{' '}
                      {fmtUsd(workTotal(thisMonth.byWork, 'stump'))} stump
                    </>
                  )}
                </>
              ) : (
                'Nothing scheduled this month'
              )}
            </p>
          </div>
        </div>

        {thisMonth && !unit && (
          <UnitSplitBar byUnit={thisMonth.byUnit} className="mt-4" />
        )}

        <div className="mt-5">
          <RevenueCalendar
            year={ym.year}
            month={ym.month}
            days={dayMap}
            unit={unit}
            today={today}
            selectedDay={onOriginalMonth ? nav.day : null}
            hrefForDay={(d) =>
              linkTo(nav, {
                year: ym.year,
                month: ym.month,
                day: d,
                list: null,
                sort: null,
                dir: null,
              })
            }
          />
        </div>

        <p className="mt-4 text-xs text-fg-3">
          Each square: tree work on top, then PHC and stump, all three added up
          below the rule. A multi-day job contributes one crew day, not its whole
          subtotal &mdash; these are capacity figures, not invoices. Work waiting
          on approval is a footnote, never part of them.{' '}
          {unit
            ? `Showing ${UNIT_LABELS[unit]} only.`
            : 'Tap a day for the job list.'}
        </p>
      </section>

      {onOriginalMonth && children}
    </>
  );
}

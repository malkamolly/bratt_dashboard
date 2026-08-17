// ============================================================================
// Date helpers - working-day math
// ============================================================================
// Working day = Monday-Friday and NOT on the holiday list.
// All inputs are JS Date objects in the user's local timezone OR ISO strings.
// ============================================================================

export type IsoDate = string; // 'YYYY-MM-DD'

export function toIsoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIsoDate(s: IsoDate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isWeekend(d: Date): boolean {
  const wd = d.getDay();
  return wd === 0 || wd === 6;
}

// ----------------------------------------------------------------------------
// Business "today" — timezone-aware
// ----------------------------------------------------------------------------
// The company runs on Central time, but the server (Vercel) runs on UTC, so
// `new Date()` and its getters answer in UTC. Everything that decides "what day
// is it right now" for pace math must resolve the wall-clock day/hour in
// Central instead, or the day would tick over at the wrong local time.

/** The timezone the business operates in. */
export const BUSINESS_TZ = 'America/Chicago';

/** Wall-clock year/month/day/hour/minute for `now` in the business timezone. */
function centralParts(now: Date): {
  y: number;
  m: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // some runtimes emit '24' for midnight
  return {
    y: get('year'),
    m: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
  };
}

/**
 * The exact instant matching a WALL-CLOCK time in the business timezone.
 *
 * Use this instead of hand-computing a UTC offset. `businessTimeToInstant(2026,
 * 8, 18, 9, 15)` is 9:15am Central on Aug 18 2026 — and because it asks Intl
 * what the zone's offset actually was on that date, it stays correct whether
 * the date lands in CDT or CST. Hardcoding `Date.UTC(..., 14, 15)` would
 * silently drift by an hour if the date ever moved across a DST boundary.
 *
 * @param month 1-12 (not the 0-based month JS Date uses)
 */
export function businessTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  // Read the wall clock as if it were UTC, ask the zone what it displays at
  // that instant, and correct by the difference. One pass is enough: the
  // offset only changes twice a year, never within the few hours of slack here.
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const shown = centralParts(new Date(naive));
  const shownAsUtc = Date.UTC(
    shown.y,
    shown.m - 1,
    shown.day,
    shown.hour,
    shown.minute,
  );
  return new Date(naive + (naive - shownAsUtc));
}

/**
 * The real calendar day in the business timezone, as a LOCAL Date at midnight
 * (matching the local-Date convention the rest of this file uses). Use this to
 * pick the "current month" so the dashboard rolls over at Central midnight, not
 * at the server's UTC midnight.
 */
export function businessToday(now: Date): Date {
  const { y, m, day } = centralParts(now);
  return new Date(y, m - 1, day);
}

/**
 * The day pace math should treat as "today" when counting elapsed working days.
 *
 * The team enters the prior day's sales the next morning, so a brand-new
 * working day shouldn't count as "elapsed" until the afternoon — otherwise the
 * projection dips every morning before that day's numbers are in. Before
 * `cutoffHour` (in Central time) we roll back to the previous calendar day, so
 * the counter only advances once the morning's data entry is done.
 *
 * Returns a LOCAL Date at midnight of the effective calendar day.
 */
export function effectiveBusinessDate(now: Date, cutoffHour = 14): Date {
  const { y, m, day, hour } = centralParts(now);
  // Anchor the Central calendar day in UTC purely for safe day arithmetic
  // (no DST edge cases), roll back if before the cutoff, then hand back a
  // local Date built from the resulting Y/M/D.
  let ms = Date.UTC(y, m - 1, day);
  if (hour < cutoffHour) ms -= 86_400_000;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Count working days in a given month.
 * Working day = Mon-Fri and not in `holidays` (a set of ISO date strings).
 */
export function workingDaysInMonth(
  year: number,
  month: number, // 1-12
  holidays: Set<IsoDate>,
): number {
  const last = new Date(year, month, 0).getDate(); // last day of month
  let count = 0;
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month - 1, day);
    if (isWeekend(d)) continue;
    if (holidays.has(toIsoDate(d))) continue;
    count++;
  }
  return count;
}

/**
 * How many working days have passed in `month` *through* `asOf`.
 * If `asOf` is in a later month, returns the full month's working days.
 * If `asOf` is in an earlier month, returns 0.
 */
export function workingDaysBeenThrough(
  year: number,
  month: number,
  asOf: Date,
  holidays: Set<IsoDate>,
): number {
  const last = new Date(year, month, 0).getDate();
  const asOfStart = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const monthStart = new Date(year, month - 1, 1);
  if (asOfStart < monthStart) return 0;

  let count = 0;
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month - 1, day);
    if (d > asOfStart) break;
    if (isWeekend(d)) continue;
    if (holidays.has(toIsoDate(d))) continue;
    count++;
  }
  return count;
}

/**
 * First and last calendar date of a (year, month) as ISO strings.
 * Useful for SQL `WHERE entry_date BETWEEN ... AND ...` queries.
 */
export function monthRange(year: number, month: number): { start: IsoDate; end: IsoDate } {
  const last = new Date(year, month, 0).getDate();
  return {
    start: toIsoDate(new Date(year, month - 1, 1)),
    end: toIsoDate(new Date(year, month - 1, last)),
  };
}

export type WorkingWeek = {
  /** ISO date of the Monday of this work-week (may be outside the month) */
  weekKey: IsoDate;
  /** Label like "May 4–8" or "Apr 27 – May 1" for the working span */
  label: string;
  /** Working days (Mon-Fri minus holidays) that fall in BOTH this week AND the target month */
  workingDays: IsoDate[];
  /** Every calendar day (Mon–Sun) in this week that falls in the target month.
   *  Includes weekends and holiday-flagged weekdays — used when summing sales
   *  so weekend or holiday bookings still roll up to the right week. */
  daysInMonth: IsoDate[];
};

/**
 * Group all working days in (year, month) into Mon-Sun calendar weeks.
 * Returns one entry per week that has at least one working day in the month.
 */
export function workingWeeksInMonth(
  year: number,
  month: number,
  holidays: Set<IsoDate>,
): WorkingWeek[] {
  const last = new Date(year, month, 0).getDate();
  const groups = new Map<string, WorkingWeek>();

  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month - 1, day);
    if (isWeekend(d)) continue;
    const iso = toIsoDate(d);
    if (holidays.has(iso)) continue;

    // Monday of this calendar week (treating Sunday=0 as end of prior week).
    const dow = d.getDay(); // 0=Sun ... 6=Sat
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - daysSinceMonday);
    const weekKey = toIsoDate(monday);

    if (!groups.has(weekKey)) {
      groups.set(weekKey, {
        weekKey,
        label: '',
        workingDays: [],
        daysInMonth: [],
      });
    }
    groups.get(weekKey)!.workingDays.push(iso);
  }

  const weeks = Array.from(groups.values()).sort((a, b) =>
    a.weekKey.localeCompare(b.weekKey),
  );
  for (const w of weeks) {
    // Expand the calendar week (Mon..Sun) from weekKey and keep every day
    // that falls inside the target month. Weekends and holidays are kept
    // so sales booked on those dates roll up into the right week.
    const mondayParts = w.weekKey.split('-').map(Number);
    const monday = new Date(mondayParts[0], mondayParts[1] - 1, mondayParts[2]);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (d.getFullYear() === year && d.getMonth() === month - 1) {
        w.daysInMonth.push(toIsoDate(d));
      }
    }

    const first = fromIsoDate(w.workingDays[0]);
    const lastDay = fromIsoDate(w.workingDays[w.workingDays.length - 1]);
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    w.label =
      first.getMonth() === lastDay.getMonth()
        ? `${fmt(first)}–${lastDay.getDate()}`
        : `${fmt(first)} – ${fmt(lastDay)}`;
  }
  return weeks;
}

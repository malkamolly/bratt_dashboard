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

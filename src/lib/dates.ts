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

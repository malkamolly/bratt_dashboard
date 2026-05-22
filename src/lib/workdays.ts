// ============================================================================
// Workday / holiday helpers
// ============================================================================
// Used by the schedule page to compute "tomorrow's schedule" — which has to
// skip weekends and the holidays Bratt Tree observes.
//
// Holidays are computed dynamically from rules (so they roll forward each
// year without needing maintenance). The current observed list is the
// common US federal/business set:
//   - New Year's Day                    Jan 1
//   - Memorial Day                      last Monday of May
//   - Independence Day                  July 4
//   - Labor Day                         first Monday of September
//   - Thanksgiving                      4th Thursday of November
//   - Day after Thanksgiving            (Black Friday)
//   - Christmas Day                     Dec 25
//
// When a fixed-date holiday lands on a weekend, the "observed" weekday
// (Friday or Monday) is also treated as a non-working day — which is how
// most US businesses, including ours, handle it.
//
// To add/remove a holiday, edit `holidaysForYear` below.
// ============================================================================

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Returns the date of the nth `weekday` of a given month.
 * `weekday` is 0=Sun..6=Sat. `n` is 1..5 for nth, or -1 for last.
 */
function nthWeekday(
  year: number,
  month1: number, // 1..12
  weekday: number,
  n: number,
): Date {
  if (n > 0) {
    const first = new Date(year, month1 - 1, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month1 - 1, 1 + offset + (n - 1) * 7);
  }
  // last weekday of month
  const last = new Date(year, month1, 0); // day 0 of next month = last day of this month
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month1 - 1, last.getDate() - offset);
}

/**
 * Returns the set of observed non-working holiday dates (as ISO strings)
 * for a given calendar year. Includes the actual holiday AND, when the
 * holiday falls on a weekend, the observed weekday (Mon if Sun, Fri if Sat).
 */
function holidaysForYear(year: number): Set<string> {
  const dates: Date[] = [
    new Date(year, 0, 1), // New Year's Day
    nthWeekday(year, 5, 1, -1), // Memorial Day — last Monday of May
    new Date(year, 6, 4), // Independence Day (July 4)
    nthWeekday(year, 9, 1, 1), // Labor Day — first Monday of September
    nthWeekday(year, 11, 4, 4), // Thanksgiving — 4th Thursday of November
    new Date(year, 11, 25), // Christmas Day
  ];
  // Black Friday = day after Thanksgiving
  const tg = dates[4];
  const bf = new Date(tg);
  bf.setDate(tg.getDate() + 1);
  dates.push(bf);

  const out = new Set<string>();
  for (const d of dates) {
    out.add(toIso(d));
    const wd = d.getDay();
    if (wd === 0) {
      const obs = new Date(d);
      obs.setDate(d.getDate() + 1);
      out.add(toIso(obs)); // Sunday → observed Monday
    } else if (wd === 6) {
      const obs = new Date(d);
      obs.setDate(d.getDate() - 1);
      out.add(toIso(obs)); // Saturday → observed Friday
    }
  }
  return out;
}

function isWorkday(d: Date, holidays: Set<string>): boolean {
  const wd = d.getDay();
  if (wd === 0 || wd === 6) return false; // Sat/Sun
  return !holidays.has(toIso(d));
}

/**
 * Returns the ISO date (YYYY-MM-DD) of the next working day after `from`
 * (defaults to today). Skips weekends and observed holidays.
 *
 * Example: on Friday May 22, 2026, returns "2026-05-26" because Saturday/
 * Sunday are weekends and Monday May 25 is Memorial Day.
 */
export function nextWorkdayIso(from?: Date): string {
  const d = from ? new Date(from) : new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);

  // Cover up to ~2 years of holidays — easily enough for any "next workday"
  // hop (the longest skip is something like 4 days around Christmas/NYE).
  const holidays = new Set<string>([
    ...holidaysForYear(d.getFullYear()),
    ...holidaysForYear(d.getFullYear() + 1),
  ]);

  // Guard the loop so a misconfiguration can't hang the page. 30 days is
  // far more than any realistic stretch of non-working days.
  for (let i = 0; i < 30; i++) {
    if (isWorkday(d, holidays)) return toIso(d);
    d.setDate(d.getDate() + 1);
  }
  return toIso(d);
}

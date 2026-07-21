// ============================================================================
// Off-Season Work (OSW) pace tracker — data layer
// ============================================================================
// Bratt Tree pushes off-season tree work two ways, each tracked across two
// delivery windows — a 2×2 grid of four "tracks":
//
//                  | Nov–Dec               | Jan–March
//   ---------------+-----------------------+-----------------------
//   Discounted OSW | discounted · nov_dec  | discounted · jan_march
//   Dormant Season | dormant · nov_dec     | dormant · jan_march
//
//   * "discounted" — the discounted push.
//   * "dormant"    — winter dormant-season work that must be done cold (oaks,
//                    etc.) to limit disease spread. Mandatory, so rarely discounted.
//
// Each day the office records, per track, the running total of off-season
// revenue on the books and the discount dollars given. This module turns those
// snapshots into what the dashboard shows: per-track progress vs an even goal
// ramp (ahead/behind pace), discount cost, and season totals across all four
// tracks. See migration 062_off_season_pace.sql for the tables.
// ============================================================================

import { serverClient } from './supabase';

export type WorkType = 'discounted' | 'dormant';
export type OsWindow = 'nov_dec' | 'jan_march';

export const WORK_TYPES: WorkType[] = ['discounted', 'dormant'];
export const OS_WINDOWS: OsWindow[] = ['nov_dec', 'jan_march'];

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  discounted: 'Discounted OSW',
  dormant: 'Dormant Season OSW',
};

export const WORK_TYPE_BLURB: Record<WorkType, string> = {
  discounted:
    'Off-season work we book at a discount to keep crews busy in the colder months.',
  dormant:
    'Work that must happen cold — oaks and other disease-prone species — to limit spread. Mandatory, so rarely discounted.',
};

export const WINDOW_LABELS: Record<OsWindow, string> = {
  nov_dec: 'Nov–Dec',
  jan_march: 'Jan–March',
};

// Dormant work is mandatory (oaks must be done cold), so it's never discounted
// — only the discounted push tracks discount dollars.
export const WORK_TYPE_HAS_DISCOUNT: Record<WorkType, boolean> = {
  discounted: true,
  dormant: false,
};

// The four tracks, in display order (grouped by work type).
export const TRACKS: { workType: WorkType; osWindow: OsWindow }[] =
  WORK_TYPES.flatMap((workType) =>
    OS_WINDOWS.map((osWindow) => ({ workType, osWindow })),
  );

// ----------------------------------------------------------------------------
// Row shapes
// ----------------------------------------------------------------------------

export type Season = {
  id: string;
  label: string;
  isCurrent: boolean;
};

export type Target = {
  workType: WorkType;
  osWindow: OsWindow;
  goalAmount: number;
  windowStart: string; // YYYY-MM-DD
  windowEnd: string; // YYYY-MM-DD
};

export type SeriesPoint = {
  date: string;
  booked: number;
  ramp: number;
};

// Everything the dashboard needs for one track.
export type TrackSummary = Target & {
  typeLabel: string;
  windowLabel: string;
  blurb: string;
  asOf: string;
  booked: number;
  expected: number;
  pace: number; // booked − expected (positive = ahead of pace)
  pctToGoal: number;
  discountGiven: number;
  discountPct: number;
  hasStarted: boolean;
  series: SeriesPoint[];
};

// A rolled-up subtotal (per work type, per window, or grand total).
export type Totals = {
  booked: number;
  goal: number;
  discount: number;
  pctToGoal: number;
};

export type DashboardData = {
  season: Season;
  seasons: Season[];
  tracks: TrackSummary[];
  grand: Totals;
  byType: Record<WorkType, Totals>;
  byWindow: Record<OsWindow, Totals>;
};

// ----------------------------------------------------------------------------
// Date helpers
// ----------------------------------------------------------------------------

function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rampValue(target: Target, date: string): number {
  const total = daysBetween(target.windowStart, target.windowEnd);
  if (total <= 0) return target.goalAmount;
  const elapsed = clamp(daysBetween(target.windowStart, date), 0, total);
  return (target.goalAmount * elapsed) / total;
}

function mkTotals(rows: { booked: number; goal: number; discount: number }[]): Totals {
  const booked = rows.reduce((s, r) => s + r.booked, 0);
  const goal = rows.reduce((s, r) => s + r.goal, 0);
  const discount = rows.reduce((s, r) => s + r.discount, 0);
  return { booked, goal, discount, pctToGoal: goal > 0 ? booked / goal : 0 };
}

// ----------------------------------------------------------------------------
// Loaders
// ----------------------------------------------------------------------------

export async function loadSeasons(): Promise<Season[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('off_season_seasons')
    .select('id, label, is_current')
    .order('label', { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    isCurrent: !!r.is_current,
  }));
}

export async function loadDashboard(
  seasonId?: string,
): Promise<DashboardData | null> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  if (seasons.length === 0) return null;

  const season =
    (seasonId && seasons.find((s) => s.id === seasonId)) ||
    seasons.find((s) => s.isCurrent) ||
    seasons[0];

  const [targetsRes, entriesRes] = await Promise.all([
    supabase
      .from('off_season_targets')
      .select('work_type, os_window, goal_amount, window_start, window_end')
      .eq('season_id', season.id),
    supabase
      .from('off_season_entries')
      .select('work_type, os_window, entry_date, scheduled_revenue, discount_given')
      .eq('season_id', season.id)
      .order('entry_date', { ascending: true }),
  ]);

  const today = todayIso();

  const tracks: TrackSummary[] = TRACKS.map(({ workType, osWindow }) => {
    const t = (targetsRes.data ?? []).find(
      (r) => r.work_type === workType && r.os_window === osWindow,
    );
    const target: Target = {
      workType,
      osWindow,
      goalAmount: t ? Number(t.goal_amount) : 0,
      windowStart: (t?.window_start as string) ?? today,
      windowEnd: (t?.window_end as string) ?? today,
    };

    const rows = (entriesRes.data ?? [])
      .filter((r) => r.work_type === workType && r.os_window === osWindow)
      .map((r) => ({
        date: r.entry_date as string,
        booked: Number(r.scheduled_revenue),
        discount: Number(r.discount_given),
      }));

    const asOf = season.isCurrent ? today : target.windowEnd;
    const upTo = rows.filter((r) => r.date <= asOf);
    const latest = upTo.length > 0 ? upTo[upTo.length - 1] : null;
    const booked = latest?.booked ?? 0;
    const discountGiven = latest?.discount ?? 0;
    const expected = rampValue(target, asOf);

    const series: SeriesPoint[] = rows.map((r) => ({
      date: r.date,
      booked: r.booked,
      ramp: rampValue(target, r.date),
    }));

    return {
      ...target,
      typeLabel: WORK_TYPE_LABELS[workType],
      windowLabel: WINDOW_LABELS[osWindow],
      blurb: WORK_TYPE_BLURB[workType],
      asOf,
      booked,
      expected,
      pace: booked - expected,
      pctToGoal: target.goalAmount > 0 ? booked / target.goalAmount : 0,
      discountGiven,
      discountPct: booked > 0 ? discountGiven / booked : 0,
      hasStarted: today >= target.windowStart,
      series,
    };
  });

  const asRow = (t: TrackSummary) => ({
    booked: t.booked,
    goal: t.goalAmount,
    discount: t.discountGiven,
  });

  return {
    season,
    seasons,
    tracks,
    grand: mkTotals(tracks.map(asRow)),
    byType: {
      discounted: mkTotals(tracks.filter((t) => t.workType === 'discounted').map(asRow)),
      dormant: mkTotals(tracks.filter((t) => t.workType === 'dormant').map(asRow)),
    },
    byWindow: {
      nov_dec: mkTotals(tracks.filter((t) => t.osWindow === 'nov_dec').map(asRow)),
      jan_march: mkTotals(tracks.filter((t) => t.osWindow === 'jan_march').map(asRow)),
    },
  };
}

// ----------------------------------------------------------------------------
// Entry-form loader: existing values for one date, keyed by track.
// ----------------------------------------------------------------------------

// Key is `${workType}__${osWindow}`.
export type EntryValues = Record<
  string,
  { scheduled: number | null; discount: number | null }
>;

export type EntrySeason = {
  season: Season;
  date: string;
  values: EntryValues;
};

export function trackKey(workType: WorkType, osWindow: OsWindow): string {
  return `${workType}__${osWindow}`;
}

export async function loadEntrySeason(date: string): Promise<EntrySeason | null> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  const season = seasons.find((s) => s.isCurrent) ?? seasons[0];
  if (!season) return null;

  const { data } = await supabase
    .from('off_season_entries')
    .select('work_type, os_window, scheduled_revenue, discount_given')
    .eq('season_id', season.id)
    .eq('entry_date', date);

  const values: EntryValues = {};
  for (const { workType, osWindow } of TRACKS) {
    values[trackKey(workType, osWindow)] = { scheduled: null, discount: null };
  }
  for (const r of data ?? []) {
    const key = trackKey(r.work_type as WorkType, r.os_window as OsWindow);
    if (key in values) {
      values[key] = {
        scheduled: Number(r.scheduled_revenue),
        discount: Number(r.discount_given),
      };
    }
  }

  return { season, date, values };
}

// ----------------------------------------------------------------------------
// Settings loader: seasons + their four targets, for the admin screen.
// ----------------------------------------------------------------------------

export type SeasonSettings = Season & { targets: Target[] };

export async function loadSettings(): Promise<SeasonSettings[]> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  if (seasons.length === 0) return [];

  const { data } = await supabase
    .from('off_season_targets')
    .select('season_id, work_type, os_window, goal_amount, window_start, window_end');

  return seasons.map((s) => ({
    ...s,
    targets: TRACKS.map(({ workType, osWindow }) => {
      const t = (data ?? []).find(
        (r) =>
          r.season_id === s.id &&
          r.work_type === workType &&
          r.os_window === osWindow,
      );
      return {
        workType,
        osWindow,
        goalAmount: t ? Number(t.goal_amount) : 0,
        windowStart: (t?.window_start as string) ?? '',
        windowEnd: (t?.window_end as string) ?? '',
      };
    }),
  }));
}

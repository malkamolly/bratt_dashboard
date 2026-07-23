// ============================================================================
// Off-Season Work (OSW) pace tracker — data layer
// ============================================================================
// Bratt Tree pushes off-season tree work two ways, tracked across two delivery
// windows. Work is RECORDED per track (a 2×2 grid), but the GOAL is a single
// combined number per WINDOW, climbing a $100k milestone ladder.
//
//   Work types:  discounted (the discounted push) · dormant (mandatory winter
//                work like oaks; never discounted)
//   Windows:     Nov–Dec · Jan–March
//   Goal:        combined (discounted + dormant) per window, e.g. $100k → $200k
//                → … up to a top goal.
//
// The tracked figure is SCHEDULED revenue — work on the calendar. Discounted
// tracks also carry discount dollars. See migrations 062–064. (An earlier
// "sold" figure was removed; the sold_revenue column, if present, is unused.)
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

export const WINDOW_LABELS: Record<OsWindow, string> = {
  nov_dec: 'Nov–Dec',
  jan_march: 'Jan–March',
};

// Dormant work is mandatory, so it's never discounted.
export const WORK_TYPE_HAS_DISCOUNT: Record<WorkType, boolean> = {
  discounted: true,
  dormant: false,
};

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

// One combined goal per window.
export type WindowTarget = {
  osWindow: OsWindow;
  goalAmount: number;
  milestoneStep: number;
  windowStart: string;
  windowEnd: string;
};

export type SeriesPoint = {
  date: string;
  scheduled: number;
  ramp: number;
};

// Scheduled/discount for one track (work type) within a window.
export type TrackBreakdown = {
  workType: WorkType;
  typeLabel: string;
  hasDiscount: boolean;
  scheduled: number;
  discount: number;
};

// Everything the dashboard needs for one window (the combined view).
export type WindowSummary = WindowTarget & {
  windowLabel: string;
  asOf: string;
  scheduled: number; // combined, the tracked figure
  discount: number; // combined
  expected: number; // even-pace target for combined scheduled, as of asOf
  pace: number; // scheduled − expected
  pctToGoal: number; // scheduled / goal
  currentMilestone: number; // highest $-rung reached
  nextMilestone: number; // next rung to aim for
  hasStarted: boolean;
  breakdown: TrackBreakdown[];
  series: SeriesPoint[];
};

export type Totals = {
  scheduled: number;
  goal: number;
  discount: number;
  pctToGoal: number;
};

export type DashboardData = {
  season: Season;
  seasons: Season[];
  windows: WindowSummary[];
  grand: Totals;
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
function rampValue(t: { windowStart: string; windowEnd: string; goalAmount: number }, date: string): number {
  const total = daysBetween(t.windowStart, t.windowEnd);
  if (total <= 0) return t.goalAmount;
  const elapsed = clamp(daysBetween(t.windowStart, date), 0, total);
  return (t.goalAmount * elapsed) / total;
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

type Snapshot = { date: string; scheduled: number; discount: number };

// Latest snapshot on or before `asOf`, or zeros.
function latestUpTo(rows: Snapshot[], asOf: string): Snapshot {
  const upTo = rows.filter((r) => r.date <= asOf);
  return upTo.length > 0 ? upTo[upTo.length - 1] : { date: asOf, scheduled: 0, discount: 0 };
}

// Combined burn-up across both tracks: union of dates, carrying each track's
// last value forward so the combined line is correct even when the two tracks
// were logged on different days.
function combinedSeries(
  byType: Record<WorkType, Snapshot[]>,
  target: WindowTarget,
): SeriesPoint[] {
  const dates = Array.from(
    new Set(WORK_TYPES.flatMap((wt) => byType[wt].map((r) => r.date))),
  ).sort();

  const idx: Record<WorkType, number> = { discounted: 0, dormant: 0 };
  const last: Record<WorkType, number> = { discounted: 0, dormant: 0 };

  return dates.map((date) => {
    for (const wt of WORK_TYPES) {
      const rows = byType[wt];
      while (idx[wt] < rows.length && rows[idx[wt]].date <= date) {
        last[wt] = rows[idx[wt]].scheduled;
        idx[wt]++;
      }
    }
    return {
      date,
      scheduled: last.discounted + last.dormant,
      ramp: rampValue(target, date),
    };
  });
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
      .select('os_window, goal_amount, milestone_step, window_start, window_end')
      .eq('season_id', season.id),
    supabase
      .from('off_season_entries')
      .select('work_type, os_window, entry_date, scheduled_revenue, discount_given')
      .eq('season_id', season.id)
      .order('entry_date', { ascending: true }),
  ]);

  const today = todayIso();

  const windows: WindowSummary[] = OS_WINDOWS.map((osWindow) => {
    const tg = (targetsRes.data ?? []).find((r) => r.os_window === osWindow);
    const target: WindowTarget = {
      osWindow,
      goalAmount: tg ? Number(tg.goal_amount) : 0,
      milestoneStep: tg && Number(tg.milestone_step) > 0 ? Number(tg.milestone_step) : 100_000,
      windowStart: (tg?.window_start as string) ?? today,
      windowEnd: (tg?.window_end as string) ?? today,
    };

    const byType: Record<WorkType, Snapshot[]> = { discounted: [], dormant: [] };
    for (const r of entriesRes.data ?? []) {
      if (r.os_window !== osWindow) continue;
      byType[r.work_type as WorkType].push({
        date: r.entry_date as string,
        scheduled: Number(r.scheduled_revenue),
        discount: Number(r.discount_given),
      });
    }

    const asOf = season.isCurrent ? today : target.windowEnd;

    const breakdown: TrackBreakdown[] = WORK_TYPES.map((wt) => {
      const s = latestUpTo(byType[wt], asOf);
      return {
        workType: wt,
        typeLabel: WORK_TYPE_LABELS[wt],
        hasDiscount: WORK_TYPE_HAS_DISCOUNT[wt],
        scheduled: s.scheduled,
        discount: s.discount,
      };
    });

    const scheduled = breakdown.reduce((a, b) => a + b.scheduled, 0);
    const discount = breakdown.reduce((a, b) => a + b.discount, 0);
    const expected = rampValue(target, asOf);

    const step = target.milestoneStep;
    const currentMilestone = Math.min(Math.floor(scheduled / step) * step, target.goalAmount);
    const nextMilestone = Math.min(currentMilestone + step, target.goalAmount);

    return {
      ...target,
      windowLabel: WINDOW_LABELS[osWindow],
      asOf,
      scheduled,
      discount,
      expected,
      pace: scheduled - expected,
      pctToGoal: target.goalAmount > 0 ? scheduled / target.goalAmount : 0,
      currentMilestone,
      nextMilestone,
      hasStarted: today >= target.windowStart,
      breakdown,
      series: combinedSeries(byType, target),
    };
  });

  const grand: Totals = {
    scheduled: windows.reduce((a, w) => a + w.scheduled, 0),
    goal: windows.reduce((a, w) => a + w.goalAmount, 0),
    discount: windows.reduce((a, w) => a + w.discount, 0),
    pctToGoal: 0,
  };
  grand.pctToGoal = grand.goal > 0 ? grand.scheduled / grand.goal : 0;

  return { season, seasons, windows, grand };
}

// ----------------------------------------------------------------------------
// Entry-form loader: existing values for one date, keyed by track.
// ----------------------------------------------------------------------------

export type EntryValues = Record<
  string,
  { scheduled: number | null; discount: number | null }
>;

export type EntrySeason = { season: Season; date: string; values: EntryValues };

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
// Settings loader: seasons + their two window goals, for the admin screen.
// ----------------------------------------------------------------------------

export type SeasonSettings = Season & { targets: WindowTarget[] };

export async function loadSettings(): Promise<SeasonSettings[]> {
  const supabase = await serverClient();
  const seasons = await loadSeasons();
  if (seasons.length === 0) return [];

  const { data } = await supabase
    .from('off_season_targets')
    .select('season_id, os_window, goal_amount, milestone_step, window_start, window_end');

  return seasons.map((s) => ({
    ...s,
    targets: OS_WINDOWS.map((osWindow) => {
      const t = (data ?? []).find(
        (r) => r.season_id === s.id && r.os_window === osWindow,
      );
      return {
        osWindow,
        goalAmount: t ? Number(t.goal_amount) : 0,
        milestoneStep: t && Number(t.milestone_step) > 0 ? Number(t.milestone_step) : 100_000,
        windowStart: (t?.window_start as string) ?? '',
        windowEnd: (t?.window_end as string) ?? '',
      };
    }),
  }));
}

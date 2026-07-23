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
// tracks also carry discount dollars. There is no date-based "pace" — progress
// is measured purely by how far up the milestone ladder the combined scheduled
// total has climbed. See migrations 062–064. (Unused columns may linger in the
// tables — sold_revenue, window_start/window_end — and are simply ignored.)
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
};

export type SeriesPoint = {
  date: string;
  scheduled: number;
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
  scheduled: number; // combined, the tracked figure
  discount: number; // combined
  pctToGoal: number; // scheduled / goal
  discountPct: number; // discount / discounted-work scheduled (the discount rate)
  discountShareOfTotal: number; // this window's discount ÷ total discount (both windows)
  currentMilestone: number; // highest $-rung reached
  nextMilestone: number; // next rung to aim for
  breakdown: TrackBreakdown[];
  series: SeriesPoint[];
};

export type Totals = {
  scheduled: number;
  goal: number;
  discount: number;
  pctToGoal: number;
  discountPct: number; // discount / discounted-work scheduled (the discount rate)
};

export type DashboardData = {
  season: Season;
  seasons: Season[];
  windows: WindowSummary[];
  grand: Totals;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

// Latest snapshot overall (rows arrive sorted ascending), or zeros.
function latest(rows: Snapshot[]): Snapshot {
  return rows.length > 0
    ? rows[rows.length - 1]
    : { date: '', scheduled: 0, discount: 0 };
}

// Combined burn-up across both tracks: union of dates, carrying each track's
// last value forward so the combined line is correct even when the two tracks
// were logged on different days.
function combinedSeries(byType: Record<WorkType, Snapshot[]>): SeriesPoint[] {
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
    return { date, scheduled: last.discounted + last.dormant };
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
      .select('os_window, goal_amount, milestone_step')
      .eq('season_id', season.id),
    supabase
      .from('off_season_entries')
      .select('work_type, os_window, entry_date, scheduled_revenue, discount_given')
      .eq('season_id', season.id)
      .order('entry_date', { ascending: true }),
  ]);

  const windows: WindowSummary[] = OS_WINDOWS.map((osWindow) => {
    const tg = (targetsRes.data ?? []).find((r) => r.os_window === osWindow);
    const target: WindowTarget = {
      osWindow,
      goalAmount: tg ? Number(tg.goal_amount) : 0,
      milestoneStep: tg && Number(tg.milestone_step) > 0 ? Number(tg.milestone_step) : 100_000,
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

    const breakdown: TrackBreakdown[] = WORK_TYPES.map((wt) => {
      const s = latest(byType[wt]);
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
    // Discount rate is measured against DISCOUNTED work only (dormant is never
    // discounted), matching the spreadsheet's "Total Discount Given %".
    const discountedScheduled = breakdown
      .filter((b) => b.hasDiscount)
      .reduce((a, b) => a + b.scheduled, 0);

    const step = target.milestoneStep;
    const currentMilestone = Math.min(Math.floor(scheduled / step) * step, target.goalAmount);
    const nextMilestone = Math.min(currentMilestone + step, target.goalAmount);

    return {
      ...target,
      windowLabel: WINDOW_LABELS[osWindow],
      scheduled,
      discount,
      pctToGoal: target.goalAmount > 0 ? scheduled / target.goalAmount : 0,
      discountPct: discountedScheduled > 0 ? discount / discountedScheduled : 0,
      discountShareOfTotal: 0, // filled in once the both-window total is known
      currentMilestone,
      nextMilestone,
      breakdown,
      series: combinedSeries(byType),
    };
  });

  const totalDiscountedScheduled = windows.reduce(
    (a, w) =>
      a + w.breakdown.filter((b) => b.hasDiscount).reduce((x, b) => x + b.scheduled, 0),
    0,
  );
  const totalDiscount = windows.reduce((a, w) => a + w.discount, 0);
  const grand: Totals = {
    scheduled: windows.reduce((a, w) => a + w.scheduled, 0),
    goal: windows.reduce((a, w) => a + w.goalAmount, 0),
    discount: totalDiscount,
    pctToGoal: 0,
    discountPct: totalDiscountedScheduled > 0 ? totalDiscount / totalDiscountedScheduled : 0,
  };
  grand.pctToGoal = grand.goal > 0 ? grand.scheduled / grand.goal : 0;

  // Each window's share of the total discount given (adds to 100%), matching
  // the spreadsheet's "OS Discounts Given %".
  for (const w of windows) {
    w.discountShareOfTotal = totalDiscount !== 0 ? w.discount / totalDiscount : 0;
  }

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
    .select('season_id, os_window, goal_amount, milestone_step');

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
      };
    }),
  }));
}

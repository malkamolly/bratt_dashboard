// ============================================================================
// Production data loader (server-only)
// ============================================================================
// Mirrors `sales-data.ts` for the production side: pulls crews, monthly
// settings, daily entries, holidays, reconciliation, and rolled-up
// historicals in one round trip. Pure I/O — pace math stays in
// `calculations.ts`.
// ============================================================================

import { serverClient } from './supabase';
import {
  monthRange,
  workingDaysInMonth,
  workingDaysBeenThrough,
  type IsoDate,
} from './dates';
import type { Crew, CrewMember } from '@/types';

export type ProductionMonthContext = {
  year: number;
  month: number;
  budgetedDays: number;
  budgetedDaysBeenThrough: number;
  asOf: Date;
};

export type ProductionEntryRow = {
  entry_date: IsoDate;
  crew_id: string;
  jobs: number;
  revenue: number;
};

export type ProductionMonthData = {
  ctx: ProductionMonthContext;
  crews: Crew[];
  entries: ProductionEntryRow[];
  /** Rolled-up monthly totals by crew. Empty for live months. When present,
   *  these WIN over daily aggregates. */
  historicals: Array<{ crew_id: string; jobs: number; revenue: number }>;
  crewBudgets: Record<string, number>;
  reconciliation: Record<string, { jobs: number; revenue: number }>;
  holidays: Set<IsoDate>;
};

function normalizeReconciliation(raw: unknown): Record<string, { jobs: number; revenue: number }> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, { jobs: number; revenue: number }> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      const jobs = Number(obj.jobs ?? 0);
      const revenue = Number(obj.revenue ?? 0);
      if (Number.isFinite(jobs) && Number.isFinite(revenue)) {
        out[k] = { jobs, revenue };
      }
    }
  }
  return out;
}

export async function loadProductionMonth(
  year?: number,
  month?: number,
): Promise<ProductionMonthData> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const supabase = await serverClient();
  const { start, end } = monthRange(y, m);

  const [
    crewsRes,
    budgetsRes,
    settingsRes,
    reconRes,
    holidayRes,
    entriesRes,
    historicalsRes,
  ] = await Promise.all([
    supabase
      .from('crews')
      .select('id, name, kind, display_order, is_active')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('crew_monthly_budgets')
      .select('crew_id, budget_revenue')
      .eq('year', y)
      .eq('month', m),
    supabase
      .from('production_monthly_settings')
      .select('budgeted_days_override')
      .eq('year', y)
      .eq('month', m)
      .maybeSingle(),
    supabase
      .from('production_reconciliations')
      .select('adjustments')
      .eq('year', y)
      .eq('month', m)
      .maybeSingle(),
    supabase
      .from('holidays')
      .select('holiday_date, observed')
      .eq('observed', true),
    supabase
      .from('production_entries')
      .select('entry_date, crew_id, jobs, revenue')
      .gte('entry_date', start)
      .lte('entry_date', end),
    supabase
      .from('production_monthly_historicals')
      .select('crew_id, jobs, revenue')
      .eq('year', y)
      .eq('month', m),
  ]);

  const holidays = new Set<IsoDate>(
    (holidayRes.data ?? []).map((h) => h.holiday_date as IsoDate),
  );

  const computedDays = workingDaysInMonth(y, m, holidays);
  const budgetedDays =
    settingsRes.data?.budgeted_days_override ?? computedDays;
  const budgetedDaysBeenThrough = workingDaysBeenThrough(y, m, now, holidays);

  const crewBudgets: Record<string, number> = {};
  for (const b of budgetsRes.data ?? []) {
    crewBudgets[b.crew_id as string] = Number(b.budget_revenue);
  }

  return {
    ctx: {
      year: y,
      month: m,
      budgetedDays,
      budgetedDaysBeenThrough,
      asOf: now,
    },
    crews: (crewsRes.data ?? []) as Crew[],
    entries: (entriesRes.data ?? []).map((e) => ({
      entry_date: e.entry_date as IsoDate,
      crew_id: e.crew_id as string,
      jobs: Number(e.jobs),
      revenue: Number(e.revenue),
    })),
    historicals: (historicalsRes.data ?? []).map((h) => ({
      crew_id: h.crew_id as string,
      jobs: Number(h.jobs),
      revenue: Number(h.revenue),
    })),
    crewBudgets,
    reconciliation: normalizeReconciliation(reconRes.data?.adjustments),
    holidays,
  };
}

export async function loadProductionEntriesForDate(date: IsoDate): Promise<{
  crews: Crew[];
  members: CrewMember[];
  /** Per-member entries for that date: maps member_id -> {crew_id, jobs, revenue} */
  memberEntries: Record<string, { crew_id: string; jobs: number; revenue: number }>;
  /** Crew-level entries (for crews without members) for that date */
  crewEntries: Record<string, { jobs: number; revenue: number }>;
}> {
  const supabase = await serverClient();
  const [crewsRes, membersRes, memberEntriesRes, crewEntriesRes] =
    await Promise.all([
      supabase
        .from('crews')
        .select('id, name, kind, display_order, is_active')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('crew_members')
        .select('id, name, home_crew_id, is_foreman, display_order, is_active')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('production_member_entries')
        .select('crew_member_id, crew_id, jobs, revenue')
        .eq('entry_date', date),
      supabase
        .from('production_entries')
        .select('crew_id, jobs, revenue')
        .eq('entry_date', date),
    ]);

  const memberEntries: Record<
    string,
    { crew_id: string; jobs: number; revenue: number }
  > = {};
  for (const row of memberEntriesRes.data ?? []) {
    memberEntries[row.crew_member_id as string] = {
      crew_id: row.crew_id as string,
      jobs: Number(row.jobs),
      revenue: Number(row.revenue),
    };
  }
  const crewEntries: Record<string, { jobs: number; revenue: number }> = {};
  for (const row of crewEntriesRes.data ?? []) {
    crewEntries[row.crew_id as string] = {
      jobs: Number(row.jobs),
      revenue: Number(row.revenue),
    };
  }

  return {
    crews: (crewsRes.data ?? []) as Crew[],
    members: (membersRes.data ?? []) as CrewMember[],
    memberEntries,
    crewEntries,
  };
}

// ----------------------------------------------------------------------------
// Year-to-date roll-up (revenue)
// ----------------------------------------------------------------------------

export type ProductionYtdData = {
  year: number;
  ytdRevenue: number;
  ytdJobs: number;
  byMonth: Array<{
    month: number;
    revenue: number;
    jobs: number;
    source: 'historicals' | 'daily';
  }>;
  annualGoal: number | null;
};

export async function loadProductionYearToDate(
  year?: number,
): Promise<ProductionYtdData> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const supabase = await serverClient();

  const [historicalsRes, entriesRes, targetRes] = await Promise.all([
    supabase
      .from('production_monthly_historicals')
      .select('month, jobs, revenue')
      .eq('year', y),
    supabase
      .from('production_entries')
      .select('entry_date, jobs, revenue')
      .gte('entry_date', `${y}-01-01`)
      .lte('entry_date', `${y}-12-31`),
    supabase
      .from('yearly_targets')
      .select('annual_production_goal')
      .eq('year', y)
      .maybeSingle(),
  ]);

  const histByMonth = new Map<number, { jobs: number; revenue: number }>();
  for (const h of historicalsRes.data ?? []) {
    const m = h.month as number;
    const cur = histByMonth.get(m) ?? { jobs: 0, revenue: 0 };
    histByMonth.set(m, {
      jobs: cur.jobs + Number(h.jobs),
      revenue: cur.revenue + Number(h.revenue),
    });
  }

  const dailyByMonth = new Map<number, { jobs: number; revenue: number }>();
  for (const e of entriesRes.data ?? []) {
    const m = Number((e.entry_date as string).slice(5, 7));
    const cur = dailyByMonth.get(m) ?? { jobs: 0, revenue: 0 };
    dailyByMonth.set(m, {
      jobs: cur.jobs + Number(e.jobs),
      revenue: cur.revenue + Number(e.revenue),
    });
  }

  const months = Array.from(
    new Set<number>([...histByMonth.keys(), ...dailyByMonth.keys()]),
  ).sort((a, b) => a - b);

  const byMonth = months.map((m) => {
    const hist = histByMonth.get(m) ?? { jobs: 0, revenue: 0 };
    const daily = dailyByMonth.get(m) ?? { jobs: 0, revenue: 0 };
    const useHist = hist.revenue > 0 || hist.jobs > 0;
    const picked = useHist ? hist : daily;
    return {
      month: m,
      jobs: picked.jobs,
      revenue: picked.revenue,
      source: useHist ? ('historicals' as const) : ('daily' as const),
    };
  });

  const annualGoal = targetRes.data?.annual_production_goal
    ? Number(targetRes.data.annual_production_goal)
    : null;
  return {
    year: y,
    ytdRevenue: byMonth.reduce((s, x) => s + x.revenue, 0),
    ytdJobs: byMonth.reduce((s, x) => s + x.jobs, 0),
    byMonth,
    annualGoal: annualGoal && annualGoal > 0 ? annualGoal : null,
  };
}

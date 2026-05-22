// ============================================================================
// Sales data loader (server-only)
// ============================================================================
// Pulls everything the Sales PACE dashboard and entry form need in one round
// trip to Supabase, then computes the working-day context. Pure I/O — all
// pace math stays in `calculations.ts`.
// ============================================================================

import { serverClient } from './supabase';
import {
  monthRange,
  workingDaysInMonth,
  workingDaysBeenThrough,
  type IsoDate,
} from './dates';
import type { Salesperson, CrewMember } from '@/types';

/** Name of the special salesperson row that aggregates add-on technicians.
 *  Per-crew-member breakdown lives in sales_addon_attributions. */
export const ADDONS_SALESPERSON_NAME = 'Add-Ons';

export type AddonAttribution = {
  id: string;
  entry_date: IsoDate;
  employee_slug: string;
  amount: number;
  note: string | null;
};

export type SalesMonthContext = {
  year: number;
  month: number; // 1-12
  budgetedDays: number;
  budgetedDaysBeenThrough: number;
  asOf: Date;
};

export type SalesEntryRow = {
  entry_date: IsoDate;
  salesperson_id: string;
  amount: number;
};

export type SalesMonthData = {
  ctx: SalesMonthContext;
  salespeople: Salesperson[];
  entries: SalesEntryRow[];
  /** Rolled-up monthly totals (one per salesperson). Empty if this month has
   *  daily entries only. When present, these WIN over daily aggregates. */
  historicals: Array<{ salesperson_id: string; amount: number }>;
  companyGoal: number;
  perPersonGoals: Record<string, number>;
  reconciliation: Record<string, number>;
  /** Observed holidays in YYYY-MM-DD; used for working-day math. */
  holidays: Set<IsoDate>;
};

function normalizeMoneyMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/**
 * Load active salespeople, month settings, entries, holidays, and any
 * reconciliation for the given (year, month). Defaults to the current month.
 */
export async function loadSalesMonth(
  year?: number,
  month?: number,
): Promise<SalesMonthData> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const supabase = await serverClient();
  const { start, end } = monthRange(y, m);

  const [
    salespeopleRes,
    settingsRes,
    reconRes,
    holidayRes,
    entriesRes,
    historicalsRes,
  ] = await Promise.all([
    supabase
      .from('salespeople')
      .select('id, name, display_order, is_active')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('sales_monthly_settings')
      .select('company_goal, per_person_goals, budgeted_days_override')
      .eq('year', y)
      .eq('month', m)
      .maybeSingle(),
    supabase
      .from('sales_reconciliations')
      .select('adjustments')
      .eq('year', y)
      .eq('month', m)
      .maybeSingle(),
    supabase
      .from('holidays')
      .select('holiday_date, observed')
      .eq('observed', true),
    supabase
      .from('sales_entries')
      .select('entry_date, salesperson_id, amount')
      .gte('entry_date', start)
      .lte('entry_date', end),
    supabase
      .from('sales_monthly_historicals')
      .select('salesperson_id, amount')
      .eq('year', y)
      .eq('month', m),
  ]);

  const holidays = new Set<IsoDate>(
    (holidayRes.data ?? []).map((h) => h.holiday_date as IsoDate),
  );

  const settings = settingsRes.data;
  const computedDays = workingDaysInMonth(y, m, holidays);
  const budgetedDays = settings?.budgeted_days_override ?? computedDays;
  const budgetedDaysBeenThrough = workingDaysBeenThrough(y, m, now, holidays);

  return {
    ctx: {
      year: y,
      month: m,
      budgetedDays,
      budgetedDaysBeenThrough,
      asOf: now,
    },
    salespeople: (salespeopleRes.data ?? []) as Salesperson[],
    entries: (entriesRes.data ?? []).map((e) => ({
      entry_date: e.entry_date as IsoDate,
      salesperson_id: e.salesperson_id as string,
      amount: Number(e.amount),
    })),
    historicals: (historicalsRes.data ?? []).map((h) => ({
      salesperson_id: h.salesperson_id as string,
      amount: Number(h.amount),
    })),
    companyGoal: Number(settings?.company_goal ?? 0),
    perPersonGoals: normalizeMoneyMap(settings?.per_person_goals),
    reconciliation: normalizeMoneyMap(reconRes.data?.adjustments),
    holidays,
  };
}

// ----------------------------------------------------------------------------
// Year-to-date roll-up
// ----------------------------------------------------------------------------

export type YearToDateData = {
  year: number;
  ytdTotal: number;
  /** One entry per month present in either historicals or daily entries.
   *  When a month has BOTH, historicals win and `source` is 'historicals'. */
  byMonth: Array<{
    month: number;
    total: number;
    source: 'historicals' | 'daily';
  }>;
  annualGoal: number | null;
};

/**
 * Sum the year's sales: closed months come from `sales_monthly_historicals`,
 * the live month comes from `sales_entries`. Annual goal is read from
 * `yearly_targets` if present.
 */
export async function loadYearToDate(year?: number): Promise<YearToDateData> {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const supabase = await serverClient();

  const [historicalsRes, entriesRes, targetRes] = await Promise.all([
    supabase
      .from('sales_monthly_historicals')
      .select('month, amount')
      .eq('year', y),
    supabase
      .from('sales_entries')
      .select('entry_date, amount')
      .gte('entry_date', `${y}-01-01`)
      .lte('entry_date', `${y}-12-31`),
    supabase
      .from('yearly_targets')
      .select('annual_goal')
      .eq('year', y)
      .maybeSingle(),
  ]);

  const histByMonth = new Map<number, number>();
  for (const h of historicalsRes.data ?? []) {
    const m = h.month as number;
    histByMonth.set(m, (histByMonth.get(m) ?? 0) + Number(h.amount));
  }

  const dailyByMonth = new Map<number, number>();
  for (const e of entriesRes.data ?? []) {
    const m = Number((e.entry_date as string).slice(5, 7));
    dailyByMonth.set(m, (dailyByMonth.get(m) ?? 0) + Number(e.amount));
  }

  const months = Array.from(
    new Set<number>([...histByMonth.keys(), ...dailyByMonth.keys()]),
  ).sort((a, b) => a - b);

  const byMonth = months.map((m) => {
    const hist = histByMonth.get(m) ?? 0;
    const daily = dailyByMonth.get(m) ?? 0;
    const useHist = hist > 0;
    return {
      month: m,
      total: useHist ? hist : daily,
      source: useHist ? ('historicals' as const) : ('daily' as const),
    };
  });

  const ytdTotal = byMonth.reduce((s, x) => s + x.total, 0);
  const annualGoal = targetRes.data?.annual_goal
    ? Number(targetRes.data.annual_goal)
    : null;

  return { year: y, ytdTotal, byMonth, annualGoal };
}

/**
 * Load just the active salespeople plus existing entries for a single date.
 * Used by the entry form to pre-fill values.
 *
 * Also returns the active field-crew-member roster and the per-member
 * Add-Ons attributions for the date, so the form can render the Add-Ons
 * editor inline.
 */
export async function loadSalesEntriesForDate(date: IsoDate): Promise<{
  salespeople: Salesperson[];
  entriesByPerson: Record<string, number>;
  crewMembers: CrewMember[];
  addonAttributions: AddonAttribution[];
  addonsSalespersonId: string | null;
}> {
  const supabase = await serverClient();
  const [salespeopleRes, entriesRes, crewMembersRes, addonsRes] =
    await Promise.all([
      supabase
        .from('salespeople')
        .select('id, name, display_order, is_active')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('sales_entries')
        .select('salesperson_id, amount')
        .eq('entry_date', date),
      supabase
        .from('field_crew_employees')
        .select('slug, name, home_crew_id, leads_crew, display_order, active')
        .eq('active', true)
        .order('name'),
      supabase
        .from('sales_addon_attributions')
        .select('id, entry_date, employee_slug, amount, note, created_at')
        .eq('entry_date', date)
        .order('created_at', { ascending: true }),
    ]);

  const entriesByPerson: Record<string, number> = {};
  for (const row of entriesRes.data ?? []) {
    entriesByPerson[row.salesperson_id as string] = Number(row.amount);
  }
  const salespeople = (salespeopleRes.data ?? []) as Salesperson[];
  const addonsSalesperson =
    salespeople.find((s) => s.name === ADDONS_SALESPERSON_NAME) ?? null;
  return {
    salespeople,
    entriesByPerson,
    crewMembers: fceToCrewMembers(crewMembersRes.data ?? []),
    addonAttributions: (addonsRes.data ?? []).map((r) => ({
      id: r.id as string,
      entry_date: r.entry_date as IsoDate,
      employee_slug: r.employee_slug as string,
      amount: Number(r.amount),
      note: (r.note as string | null) ?? null,
    })),
    addonsSalespersonId: addonsSalesperson?.id ?? null,
  };
}

type FceRow = {
  slug: string;
  name: string;
  home_crew_id: string | null;
  leads_crew: boolean;
  display_order: number;
  active: boolean;
};

function fceToCrewMembers(rows: unknown[]): CrewMember[] {
  return (rows as FceRow[]).map((r) => ({
    slug: r.slug,
    name: r.name,
    home_crew_id: r.home_crew_id,
    is_foreman: r.leads_crew,
    display_order: r.display_order,
    is_active: r.active,
  }));
}

/** Load all Add-Ons attributions for a date range, plus the active crew
 *  member roster for naming. Used by the Add-Ons detail page. */
export async function loadAddonAttributionsForRange(
  start: IsoDate,
  end: IsoDate,
): Promise<{
  attributions: AddonAttribution[];
  crewMembers: CrewMember[];
}> {
  const supabase = await serverClient();
  const [attributionsRes, crewMembersRes] = await Promise.all([
    supabase
      .from('sales_addon_attributions')
      .select('id, entry_date, employee_slug, amount, note')
      .gte('entry_date', start)
      .lte('entry_date', end)
      .order('entry_date', { ascending: true }),
    supabase
      .from('field_crew_employees')
      .select('slug, name, home_crew_id, leads_crew, display_order, active')
      .order('display_order'),
  ]);

  return {
    attributions: (attributionsRes.data ?? []).map((r) => ({
      id: r.id as string,
      entry_date: r.entry_date as IsoDate,
      employee_slug: r.employee_slug as string,
      amount: Number(r.amount),
      note: (r.note as string | null) ?? null,
    })),
    crewMembers: fceToCrewMembers(crewMembersRes.data ?? []),
  };
}

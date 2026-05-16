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
import type { Salesperson } from '@/types';

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
    companyGoal: Number(settings?.company_goal ?? 0),
    perPersonGoals: normalizeMoneyMap(settings?.per_person_goals),
    reconciliation: normalizeMoneyMap(reconRes.data?.adjustments),
    holidays,
  };
}

/**
 * Load just the active salespeople plus existing entries for a single date.
 * Used by the entry form to pre-fill values.
 */
export async function loadSalesEntriesForDate(date: IsoDate): Promise<{
  salespeople: Salesperson[];
  entriesByPerson: Record<string, number>;
}> {
  const supabase = await serverClient();
  const [salespeopleRes, entriesRes] = await Promise.all([
    supabase
      .from('salespeople')
      .select('id, name, display_order, is_active')
      .eq('is_active', true)
      .order('display_order'),
    supabase
      .from('sales_entries')
      .select('salesperson_id, amount')
      .eq('entry_date', date),
  ]);

  const entriesByPerson: Record<string, number> = {};
  for (const row of entriesRes.data ?? []) {
    entriesByPerson[row.salesperson_id as string] = Number(row.amount);
  }
  return {
    salespeople: (salespeopleRes.data ?? []) as Salesperson[],
    entriesByPerson,
  };
}

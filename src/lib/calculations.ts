// ============================================================================
// Bratt Tree Dashboard - PACE Calculations
// ============================================================================
// This file is the single source of truth for every number shown on the
// dashboard. It replaces every formula from the legacy Excel files.
//
// Conventions:
//   - Money values are plain numbers in dollars (e.g. 1234.56 means $1,234.56).
//   - Dates are ISO date strings ("YYYY-MM-DD") or Date objects, never Excel
//     serials. Use the helpers in `dates.ts` for conversions.
//   - Pure functions only. No DB, no fetch, no side effects. Easy to test.
// ============================================================================

export type SalesEntry = {
  entry_date: string;       // YYYY-MM-DD
  salesperson_id: string;
  amount: number;
};

export type ProductionEntry = {
  entry_date: string;
  crew_id: string;
  jobs: number;
  revenue: number;
};

export type SalesReconciliation = {
  // adjustments keyed by salesperson_id, in dollars (can be negative)
  adjustments: Record<string, number>;
};

export type ProductionReconciliation = {
  // adjustments keyed by crew_id
  adjustments: Record<string, { jobs: number; revenue: number }>;
};

// ----------------------------------------------------------------------------
// SALES
// ----------------------------------------------------------------------------

export type SalesPaceInput = {
  entries: SalesEntry[];
  reconciliation?: SalesReconciliation;
  budgetedDays: number;
  budgetedDaysBeenThrough: number;
  companyGoal: number;
  perPersonGoals: Record<string, number>; // salesperson_id -> dollars
  salespeopleIds: string[];
};

export type SalesPersonPace = {
  salesperson_id: string;
  mtd_total: number;
  mtd_pace: number;            // projected month-end if current rate holds
  goal: number | null;         // null = "TBD"
  pct_to_goal: number | null;  // mtd_total / goal, or null if no goal
};

export type SalesPaceResult = {
  perSalesperson: SalesPersonPace[];
  company: {
    mtd_total: number;
    mtd_pace: number;
    goal: number;
    pct_to_goal: number;
    daily_needed_to_remain_on_pace: number;
    daily_needed_to_achieve_budget: number;
    budgeted_days: number;
    budgeted_days_been_through: number;
    budgeted_days_remaining: number;
  };
};

export function calculateSalesPace(input: SalesPaceInput): SalesPaceResult {
  const {
    entries,
    reconciliation,
    budgetedDays,
    budgetedDaysBeenThrough,
    companyGoal,
    perPersonGoals,
    salespeopleIds,
  } = input;

  const daysRemaining = Math.max(0, budgetedDays - budgetedDaysBeenThrough);
  const adj = reconciliation?.adjustments ?? {};

  // Aggregate MTD per salesperson
  const mtdById = new Map<string, number>();
  for (const id of salespeopleIds) mtdById.set(id, 0);
  for (const e of entries) {
    mtdById.set(e.salesperson_id, (mtdById.get(e.salesperson_id) ?? 0) + e.amount);
  }
  // Apply reconciliation
  for (const [id, delta] of Object.entries(adj)) {
    mtdById.set(id, (mtdById.get(id) ?? 0) + delta);
  }

  const perSalesperson: SalesPersonPace[] = salespeopleIds.map((id) => {
    const mtd_total = mtdById.get(id) ?? 0;
    const mtd_pace =
      budgetedDaysBeenThrough > 0
        ? (mtd_total / budgetedDaysBeenThrough) * budgetedDays
        : 0;
    const goal = perPersonGoals[id] ?? null;
    const pct_to_goal = goal && goal > 0 ? mtd_total / goal : null;
    return { salesperson_id: id, mtd_total, mtd_pace, goal, pct_to_goal };
  });

  const company_mtd = perSalesperson.reduce((s, p) => s + p.mtd_total, 0);
  const company_pace =
    budgetedDaysBeenThrough > 0
      ? (company_mtd / budgetedDaysBeenThrough) * budgetedDays
      : 0;

  const daily_needed_to_remain_on_pace =
    budgetedDaysBeenThrough > 0 ? company_mtd / budgetedDaysBeenThrough : 0;

  const daily_needed_to_achieve_budget =
    daysRemaining > 0 ? Math.max(0, companyGoal - company_mtd) / daysRemaining : 0;

  return {
    perSalesperson,
    company: {
      mtd_total: company_mtd,
      mtd_pace: company_pace,
      goal: companyGoal,
      pct_to_goal: companyGoal > 0 ? company_mtd / companyGoal : 0,
      daily_needed_to_remain_on_pace,
      daily_needed_to_achieve_budget,
      budgeted_days: budgetedDays,
      budgeted_days_been_through: budgetedDaysBeenThrough,
      budgeted_days_remaining: daysRemaining,
    },
  };
}

// ----------------------------------------------------------------------------
// PRODUCTION (and PHC, same shape)
// ----------------------------------------------------------------------------

export type ProductionPaceInput = {
  entries: ProductionEntry[];
  reconciliation?: ProductionReconciliation;
  budgetedDays: number;
  budgetedDaysBeenThrough: number;
  crewBudgets: Record<string, number>;  // crew_id -> monthly $ budget
  crewIds: string[];
};

export type CrewPace = {
  crew_id: string;
  mtd_jobs: number;
  mtd_revenue: number;
  daily_avg_jobs: number;
  daily_avg_revenue: number;
  budget: number;
  remaining_revenue_needed: number;
  daily_budget_needed: number;       // remaining / days remaining
  pacing_revenue: number;            // projected month-end revenue
  avg_job_size: number;              // revenue / jobs
  pct_to_budget: number;             // mtd_revenue / budget (0 if budget=0)
};

export type ProductionPaceResult = {
  perCrew: CrewPace[];
  combined: {
    mtd_jobs: number;
    mtd_revenue: number;
    daily_avg_jobs: number;
    daily_avg_revenue: number;
    total_budget: number;
    total_remaining_revenue: number;
    total_daily_budget_needed: number;
    total_pacing_revenue: number;
    avg_job_size: number;
    budgeted_days: number;
    budgeted_days_been_through: number;
    budgeted_days_remaining: number;
  };
};

export function calculateProductionPace(
  input: ProductionPaceInput,
): ProductionPaceResult {
  const {
    entries,
    reconciliation,
    budgetedDays,
    budgetedDaysBeenThrough,
    crewBudgets,
    crewIds,
  } = input;

  const daysRemaining = Math.max(0, budgetedDays - budgetedDaysBeenThrough);
  const adj = reconciliation?.adjustments ?? {};

  // Aggregate MTD jobs + revenue per crew
  const mtdJobs = new Map<string, number>();
  const mtdRevenue = new Map<string, number>();
  for (const id of crewIds) {
    mtdJobs.set(id, 0);
    mtdRevenue.set(id, 0);
  }
  for (const e of entries) {
    mtdJobs.set(e.crew_id, (mtdJobs.get(e.crew_id) ?? 0) + e.jobs);
    mtdRevenue.set(e.crew_id, (mtdRevenue.get(e.crew_id) ?? 0) + e.revenue);
  }
  for (const [id, d] of Object.entries(adj)) {
    mtdJobs.set(id, (mtdJobs.get(id) ?? 0) + (d.jobs ?? 0));
    mtdRevenue.set(id, (mtdRevenue.get(id) ?? 0) + (d.revenue ?? 0));
  }

  const perCrew: CrewPace[] = crewIds.map((id) => {
    const jobs = mtdJobs.get(id) ?? 0;
    const revenue = mtdRevenue.get(id) ?? 0;
    const budget = crewBudgets[id] ?? 0;
    const daily_avg_jobs =
      budgetedDaysBeenThrough > 0 ? jobs / budgetedDaysBeenThrough : 0;
    const daily_avg_revenue =
      budgetedDaysBeenThrough > 0 ? revenue / budgetedDaysBeenThrough : 0;
    const remaining_revenue_needed = budget - revenue;
    const daily_budget_needed =
      daysRemaining > 0 ? Math.max(0, remaining_revenue_needed) / daysRemaining : 0;
    const pacing_revenue =
      budgetedDaysBeenThrough > 0
        ? (revenue / budgetedDaysBeenThrough) * budgetedDays
        : 0;
    const avg_job_size = jobs > 0 ? revenue / jobs : 0;
    const pct_to_budget = budget > 0 ? revenue / budget : 0;
    return {
      crew_id: id,
      mtd_jobs: jobs,
      mtd_revenue: revenue,
      daily_avg_jobs,
      daily_avg_revenue,
      budget,
      remaining_revenue_needed,
      daily_budget_needed,
      pacing_revenue,
      avg_job_size,
      pct_to_budget,
    };
  });

  const total_jobs = perCrew.reduce((s, c) => s + c.mtd_jobs, 0);
  const total_revenue = perCrew.reduce((s, c) => s + c.mtd_revenue, 0);
  const total_budget = perCrew.reduce((s, c) => s + c.budget, 0);
  const total_remaining_revenue = total_budget - total_revenue;
  const total_daily_budget_needed =
    daysRemaining > 0
      ? Math.max(0, total_remaining_revenue) / daysRemaining
      : 0;
  const total_pacing_revenue =
    budgetedDaysBeenThrough > 0
      ? (total_revenue / budgetedDaysBeenThrough) * budgetedDays
      : 0;

  return {
    perCrew,
    combined: {
      mtd_jobs: total_jobs,
      mtd_revenue: total_revenue,
      daily_avg_jobs:
        budgetedDaysBeenThrough > 0 ? total_jobs / budgetedDaysBeenThrough : 0,
      daily_avg_revenue:
        budgetedDaysBeenThrough > 0 ? total_revenue / budgetedDaysBeenThrough : 0,
      total_budget,
      total_remaining_revenue,
      total_daily_budget_needed,
      total_pacing_revenue,
      avg_job_size: total_jobs > 0 ? total_revenue / total_jobs : 0,
      budgeted_days: budgetedDays,
      budgeted_days_been_through: budgetedDaysBeenThrough,
      budgeted_days_remaining: daysRemaining,
    },
  };
}

// ----------------------------------------------------------------------------
// Pace status (used to color cards on the dashboard)
// ----------------------------------------------------------------------------

export type PaceStatus = 'on-pace' | 'behind' | 'ahead' | 'no-data';

export function paceStatus(
  mtd: number,
  goal: number,
  daysBeenThrough: number,
  budgetedDays: number,
  tolerance = 0.05,
): PaceStatus {
  if (daysBeenThrough <= 0 || budgetedDays <= 0) return 'no-data';
  const expected = (daysBeenThrough / budgetedDays) * goal;
  if (expected <= 0) return 'no-data';
  const ratio = mtd / expected;
  if (ratio >= 1 + tolerance) return 'ahead';
  if (ratio < 1 - tolerance) return 'behind';
  return 'on-pace';
}

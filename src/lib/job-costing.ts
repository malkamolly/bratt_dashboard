// ============================================================================
// Job costing — labor sample (server-only, static data)
// ============================================================================
// A hand-picked sample of 14 tree-removal jobs ($5k+) where labor was entered
// by hand from the source system's per-job timesheets (the bulk timesheet
// export is license-gated and misses the groundmen, so a sample is the only
// reliable way in for now).
//
// IMPORTANT framing this module encodes:
//  - laborCost is BASE WAGES only — no payroll tax, workers' comp, or benefits,
//    and no equipment/fuel/disposal/overhead. So "revenue - labor" is NOT
//    profit; the reliable figure is labor as a share of revenue.
//  - Costs are pre-computed per job so individual wages never ship to the
//    browser. Crew members appear with hours only, no per-person dollars.
// ============================================================================

import rawJobs from '@/data/job-costing-sample.json';

export type CrewMemberHours = { name: string; hours: number };

export type CostedJob = {
  inv: string;
  seller: string | null;
  trees: number;
  sizes: number[];
  revenue: number;
  days: number;
  crewSize: number;
  crewHours: number;
  laborCost: number;
  /** laborCost / revenue, 0..1 */
  laborPct: number;
  crew: CrewMemberHours[];
};

export type JobCostingSummary = {
  jobs: number;
  totalRevenue: number;
  totalLabor: number;
  totalHours: number;
  laborPctOverall: number;
  laborPctMin: number;
  laborPctMax: number;
  multiDayLaborPct: number; // avg labor share on multi-day jobs
  singleDayLaborPct: number; // avg labor share on single-day jobs
};

export function loadCostedJobs(): CostedJob[] {
  return (rawJobs as CostedJob[]).slice().sort((a, b) => a.revenue - b.revenue);
}

export function jobCostingSummary(jobs: CostedJob[]): JobCostingSummary {
  const totalRevenue = jobs.reduce((s, j) => s + j.revenue, 0);
  const totalLabor = jobs.reduce((s, j) => s + j.laborCost, 0);
  const totalHours = Math.round(jobs.reduce((s, j) => s + j.crewHours, 0));
  const pcts = jobs.map((j) => j.laborPct);

  // Revenue-weighted labor share, split by single- vs multi-day.
  const share = (subset: CostedJob[]) => {
    const r = subset.reduce((s, j) => s + j.revenue, 0);
    const l = subset.reduce((s, j) => s + j.laborCost, 0);
    return r > 0 ? l / r : 0;
  };

  return {
    jobs: jobs.length,
    totalRevenue,
    totalLabor,
    totalHours,
    laborPctOverall: totalLabor / totalRevenue,
    laborPctMin: Math.min(...pcts),
    laborPctMax: Math.max(...pcts),
    multiDayLaborPct: share(jobs.filter((j) => j.days > 1)),
    singleDayLaborPct: share(jobs.filter((j) => j.days === 1)),
  };
}

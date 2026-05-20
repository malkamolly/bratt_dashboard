'use server';

// ============================================================================
// Daily schedule load / save server actions
// ============================================================================
// Backed by the `daily_schedules` table (migration 018). One row per date.
// `jobs` is a JSONB array of job objects entered by the scheduler.
// ============================================================================

import { serverClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';

export type Category = 'field-crew' | 'phc' | 'stump' | 'clam-hauling';

export type SavedJob = {
  id: string;
  category: Category;
  label: string;
  revenue: number; // dollars, two decimals max
  days: number;    // integer >= 1
};

export type SavedSchedule = {
  scheduleDate: string;       // YYYY-MM-DD
  jobs: SavedJob[];
  updatedAt: string;          // ISO timestamp
  updatedBy: string | null;   // email of last saver
};

const VALID_CATEGORIES: Category[] = ['field-crew', 'phc', 'stump', 'clam-hauling'];

function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function sanitizeJob(raw: unknown): SavedJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const j = raw as Record<string, unknown>;
  const id = typeof j.id === 'string' && j.id.length > 0 ? j.id : null;
  const category = VALID_CATEGORIES.includes(j.category as Category)
    ? (j.category as Category)
    : null;
  if (!id || !category) return null;
  const label = typeof j.label === 'string' ? j.label.slice(0, 200) : '';
  const revenueRaw = typeof j.revenue === 'number' ? j.revenue : Number(j.revenue);
  const revenue =
    Number.isFinite(revenueRaw) && revenueRaw >= 0
      ? Math.round(revenueRaw * 100) / 100
      : 0;
  const daysRaw = typeof j.days === 'number' ? j.days : Number(j.days);
  const days = Number.isFinite(daysRaw) && daysRaw >= 1 ? Math.floor(daysRaw) : 1;
  return { id, category, label, revenue, days };
}

export async function loadSchedule(
  date: string,
): Promise<SavedSchedule | null> {
  if (!isValidIsoDate(date)) return null;

  const user = await getAllowedUser();
  if (!user || user.role !== 'admin') return null;

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('daily_schedules')
    .select('schedule_date, jobs, updated_at, updated_by')
    .eq('schedule_date', date)
    .maybeSingle();

  if (error || !data) return null;

  const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs = rawJobs.map(sanitizeJob).filter((j): j is SavedJob => j !== null);

  return {
    scheduleDate: data.schedule_date as string,
    jobs,
    updatedAt: data.updated_at as string,
    updatedBy: (data.updated_by as string | null) ?? null,
  };
}

export type SaveResult =
  | { ok: true; updatedAt: string; updatedBy: string | null }
  | { ok: false; error: string };

export async function saveSchedule(
  date: string,
  jobs: unknown,
): Promise<SaveResult> {
  if (!isValidIsoDate(date)) {
    return { ok: false, error: 'Invalid date.' };
  }

  const user = await getAllowedUser();
  if (!user || user.role !== 'admin') {
    return { ok: false, error: 'Not authorized.' };
  }

  if (!Array.isArray(jobs)) {
    return { ok: false, error: 'Jobs payload must be an array.' };
  }
  if (jobs.length > 200) {
    return { ok: false, error: 'Too many jobs (max 200).' };
  }

  const sanitized = jobs
    .map(sanitizeJob)
    .filter((j): j is SavedJob => j !== null);

  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('daily_schedules')
    .upsert(
      {
        schedule_date: date,
        jobs: sanitized,
        updated_by: user.email,
      },
      { onConflict: 'schedule_date' },
    )
    .select('updated_at, updated_by')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Save failed.' };
  }

  return {
    ok: true,
    updatedAt: data.updated_at as string,
    updatedBy: (data.updated_by as string | null) ?? null,
  };
}

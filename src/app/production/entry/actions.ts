'use server';

// ============================================================================
// Production entry server actions
// ============================================================================
// One save action that handles per-member entries AND per-crew direct entries
// (for crews without members). After saving, the crew-level rollup in
// `production_entries` is recomputed for the date so the dashboard stays
// in sync with what was entered.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser } from '@/lib/auth';

export type SaveResult = { ok: false; error: string } | undefined;

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function parseMoney(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseJobsCount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const n = Number(s.replace(/[\s,]/g, ''));
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

type MemberInput = { jobs: number; revenue: number; crewId: string };
type CrewInput = { jobs: number; revenue: number };

export async function saveProductionEntries(
  _prev: SaveResult,
  formData: FormData,
): Promise<SaveResult> {
  const user = await getAllowedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const date = String(formData.get('entry_date') ?? '');
  if (!isValidIsoDate(date)) {
    return { ok: false, error: 'Please pick a valid date.' };
  }

  // ---- Parse all member inputs (jobs__member_<id>, revenue__member_<id>, crew__member_<id>)
  const memberInputs = new Map<string, MemberInput>();
  // ---- Parse all crew-level inputs for crews without members (jobs__crew_<id>, revenue__crew_<id>)
  const crewInputs = new Map<string, CrewInput>();

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('jobs__member_')) {
      const id = key.slice('jobs__member_'.length);
      const n = parseJobsCount(value);
      if (n == null) return { ok: false, error: 'Bad jobs count for a member.' };
      const cur = memberInputs.get(id) ?? { jobs: 0, revenue: 0, crewId: '' };
      memberInputs.set(id, { ...cur, jobs: n });
    } else if (key.startsWith('revenue__member_')) {
      const id = key.slice('revenue__member_'.length);
      const n = parseMoney(value);
      if (n == null) return { ok: false, error: 'Bad revenue for a member.' };
      const cur = memberInputs.get(id) ?? { jobs: 0, revenue: 0, crewId: '' };
      memberInputs.set(id, { ...cur, revenue: n });
    } else if (key.startsWith('crew__member_')) {
      const id = key.slice('crew__member_'.length);
      const cid = String(value);
      const cur = memberInputs.get(id) ?? { jobs: 0, revenue: 0, crewId: '' };
      memberInputs.set(id, { ...cur, crewId: cid });
    } else if (key.startsWith('jobs__crew_')) {
      const id = key.slice('jobs__crew_'.length);
      const n = parseJobsCount(value);
      if (n == null) return { ok: false, error: 'Bad jobs count for a crew.' };
      const cur = crewInputs.get(id) ?? { jobs: 0, revenue: 0 };
      crewInputs.set(id, { ...cur, jobs: n });
    } else if (key.startsWith('revenue__crew_')) {
      const id = key.slice('revenue__crew_'.length);
      const n = parseMoney(value);
      if (n == null) return { ok: false, error: 'Bad revenue for a crew.' };
      const cur = crewInputs.get(id) ?? { jobs: 0, revenue: 0 };
      crewInputs.set(id, { ...cur, revenue: n });
    }
  }

  const supabase = await serverClient();

  // Full-replacement strategy: delete the day's existing rows, then re-insert
  // only the non-zero ones. Keeps state idempotent and handles moves/clears.
  // (Two delete calls + two insert calls.)
  const { error: delMembersErr } = await supabase
    .from('production_member_entries')
    .delete()
    .eq('entry_date', date);
  if (delMembersErr) return { ok: false, error: delMembersErr.message };

  const { error: delCrewsErr } = await supabase
    .from('production_entries')
    .delete()
    .eq('entry_date', date);
  if (delCrewsErr) return { ok: false, error: delCrewsErr.message };

  // Insert member entries (only members with any non-zero values).
  // `id` here is the field_crew_employees.slug (form field names are
  // jobs__member_<slug> / revenue__member_<slug> / crew__member_<slug>).
  const memberRows: Array<{
    entry_date: string;
    employee_slug: string;
    crew_id: string;
    jobs: number;
    revenue: number;
    created_by: string;
  }> = [];
  for (const [id, input] of memberInputs.entries()) {
    if (!input.crewId) continue; // skip members with no crew assignment
    if (input.jobs === 0 && input.revenue === 0) continue;
    memberRows.push({
      entry_date: date,
      employee_slug: id,
      crew_id: input.crewId,
      jobs: input.jobs,
      revenue: input.revenue,
      created_by: user.email,
    });
  }
  if (memberRows.length > 0) {
    const { error } = await supabase
      .from('production_member_entries')
      .insert(memberRows);
    if (error) return { ok: false, error: error.message };
  }

  // Compute per-crew rollups: sum member entries by crew_id, then add any
  // crew-level direct entries (for crews without members).
  const crewTotals = new Map<string, { jobs: number; revenue: number }>();
  for (const r of memberRows) {
    const cur = crewTotals.get(r.crew_id) ?? { jobs: 0, revenue: 0 };
    crewTotals.set(r.crew_id, {
      jobs: cur.jobs + r.jobs,
      revenue: Math.round((cur.revenue + r.revenue) * 100) / 100,
    });
  }
  for (const [crewId, input] of crewInputs.entries()) {
    if (input.jobs === 0 && input.revenue === 0) continue;
    const cur = crewTotals.get(crewId) ?? { jobs: 0, revenue: 0 };
    crewTotals.set(crewId, {
      jobs: cur.jobs + input.jobs,
      revenue: Math.round((cur.revenue + input.revenue) * 100) / 100,
    });
  }

  const crewRows = Array.from(crewTotals.entries()).map(([crew_id, totals]) => ({
    entry_date: date,
    crew_id,
    jobs: totals.jobs,
    revenue: totals.revenue,
    created_by: user.email,
  }));
  if (crewRows.length > 0) {
    const { error } = await supabase.from('production_entries').insert(crewRows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/production');
  revalidatePath('/production/entry');
  redirect(`/production/entry?date=${encodeURIComponent(date)}&saved=1`);
}

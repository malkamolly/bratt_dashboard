'use server';

// ============================================================================
// Admin server actions
// ============================================================================
// One action per "Save" button on the admin page. Every action verifies admin
// role before writing - RLS would block non-admin writes too, but we error
// out earlier with a friendlier message.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';

function parseMoney(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseIntStrict(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n)) return null;
  return n;
}

function refreshAffectedPages() {
  revalidatePath('/');
  revalidatePath('/sales');
  revalidatePath('/admin');
}

// ----------------------------------------------------------------------------
// 1. Annual goal
// ----------------------------------------------------------------------------
export async function saveAnnualGoal(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const annualGoal = parseMoney(formData.get('annual_goal'));
  if (year == null || annualGoal == null) {
    redirect('/admin?error=invalid_annual_goal');
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('yearly_targets')
    .upsert({ year: year!, annual_goal: annualGoal! }, { onConflict: 'year' });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin?saved=annual');
}

// ----------------------------------------------------------------------------
// 2. Monthly goals (company goal + per-person goals)
// ----------------------------------------------------------------------------
export async function saveMonthlyGoals(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const month = parseIntStrict(formData.get('month'));
  const companyGoal = parseMoney(formData.get('company_goal'));
  if (year == null || month == null || companyGoal == null) {
    redirect('/admin?error=invalid_monthly_goals');
  }

  // Per-person inputs are keyed "goal__<salesperson_id>".
  const perPersonGoals: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('goal__')) continue;
    const id = key.slice('goal__'.length);
    const amt = parseMoney(value);
    if (amt == null) {
      redirect('/admin?error=invalid_person_goal');
    }
    if (amt! > 0) perPersonGoals[id] = amt!;
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('sales_monthly_settings')
    .upsert(
      {
        year: year!,
        month: month!,
        company_goal: companyGoal!,
        per_person_goals: perPersonGoals,
      },
      { onConflict: 'year,month' },
    );
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect(`/admin?year=${year}&month=${month}&saved=goals`);
}

// ----------------------------------------------------------------------------
// 3. Monthly historicals (per-salesperson totals for a closed month)
// ----------------------------------------------------------------------------
export async function saveHistoricals(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const month = parseIntStrict(formData.get('month'));
  if (year == null || month == null) {
    redirect('/admin?error=invalid_historicals');
  }

  type Row = {
    year: number;
    month: number;
    salesperson_id: string;
    amount: number;
    source_note: string;
    created_by: string;
  };
  const rows: Row[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('hist__')) continue;
    const salesperson_id = key.slice('hist__'.length);
    const amount = parseMoney(value);
    if (amount == null) {
      redirect('/admin?error=invalid_hist_amount');
    }
    rows.push({
      year: year!,
      month: month!,
      salesperson_id,
      amount: amount!,
      source_note: 'Edited via admin form',
      created_by: user.email,
    });
  }

  if (rows.length === 0) {
    redirect(`/admin?year=${year}&month=${month}&error=no_rows`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('sales_monthly_historicals')
    .upsert(rows, { onConflict: 'year,month,salesperson_id' });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect(`/admin?year=${year}&month=${month}&saved=historicals`);
}

// ----------------------------------------------------------------------------
// 4. Roster: add, edit, deactivate
// ----------------------------------------------------------------------------

export async function addSalesperson(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 999;
  if (!name) redirect('/admin?error=missing_name');

  const supabase = await serverClient();
  const { error } = await supabase
    .from('salespeople')
    .insert({ name, display_order: displayOrder, is_active: true });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin?saved=salesperson_added');
}

export async function updateSalesperson(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 0;
  const isActive = formData.get('is_active') === 'on';
  if (!id || !name) redirect('/admin?error=missing_fields');

  const supabase = await serverClient();
  const { error } = await supabase
    .from('salespeople')
    .update({ name, display_order: displayOrder, is_active: isActive })
    .eq('id', id);
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin?saved=salesperson_updated');
}

// ----------------------------------------------------------------------------
// 5. Crew members (production roster)
// ----------------------------------------------------------------------------
export async function addCrewMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const homeCrewId = String(formData.get('home_crew_id') ?? '') || null;
  const isForeman = formData.get('is_foreman') === 'on';
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 999;
  if (!name) redirect('/admin?error=missing_name');

  const supabase = await serverClient();
  const { error } = await supabase.from('crew_members').insert({
    name,
    home_crew_id: homeCrewId,
    is_foreman: isForeman,
    display_order: displayOrder,
    is_active: true,
  });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin?saved=crew_member_added');
}

export async function updateCrewMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const homeCrewId = String(formData.get('home_crew_id') ?? '') || null;
  const isForeman = formData.get('is_foreman') === 'on';
  const isActive = formData.get('is_active') === 'on';
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 0;
  if (!id || !name) redirect('/admin?error=missing_fields');

  const supabase = await serverClient();
  const { error } = await supabase
    .from('crew_members')
    .update({
      name,
      home_crew_id: homeCrewId,
      is_foreman: isForeman,
      is_active: isActive,
      display_order: displayOrder,
    })
    .eq('id', id);
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin?saved=crew_member_updated');
}

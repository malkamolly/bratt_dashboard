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
  revalidatePath('/production');
  revalidatePath('/admin');
  revalidatePath('/admin/sales');
  revalidatePath('/admin/production');
}

// ----------------------------------------------------------------------------
// 1. Annual goal
// ----------------------------------------------------------------------------
export async function saveAnnualGoal(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const annualGoal = parseMoney(formData.get('annual_goal'));
  if (year == null || annualGoal == null) {
    redirect('/admin/sales?error=invalid_annual_goal');
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('yearly_targets')
    .upsert({ year: year!, annual_goal: annualGoal! }, { onConflict: 'year' });
  if (error) redirect(`/admin/sales?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin/sales?saved=annual');
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
    redirect('/admin/sales?error=invalid_monthly_goals');
  }

  // Per-person inputs are keyed "goal__<salesperson_id>".
  const perPersonGoals: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('goal__')) continue;
    const id = key.slice('goal__'.length);
    const amt = parseMoney(value);
    if (amt == null) {
      redirect('/admin/sales?error=invalid_person_goal');
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
  if (error) redirect(`/admin/sales?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect(`/admin/sales?year=${year}&month=${month}&saved=goals`);
}

// ----------------------------------------------------------------------------
// 3. Monthly historicals (per-salesperson totals for a closed month)
// ----------------------------------------------------------------------------
export async function saveHistoricals(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const month = parseIntStrict(formData.get('month'));
  if (year == null || month == null) {
    redirect('/admin/sales?error=invalid_historicals');
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
      redirect('/admin/sales?error=invalid_hist_amount');
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
    redirect(`/admin/sales?year=${year}&month=${month}&error=no_rows`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('sales_monthly_historicals')
    .upsert(rows, { onConflict: 'year,month,salesperson_id' });
  if (error) redirect(`/admin/sales?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect(`/admin/sales?year=${year}&month=${month}&saved=historicals`);
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
  if (error) redirect(`/admin/sales?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin/sales?saved=salesperson_added');
}

export async function updateSalesperson(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 0;
  const isActive = formData.get('is_active') === 'on';
  if (!id || !name) redirect('/admin/sales?error=missing_fields');

  const supabase = await serverClient();
  const { error } = await supabase
    .from('salespeople')
    .update({ name, display_order: displayOrder, is_active: isActive })
    .eq('id', id);
  if (error) redirect(`/admin/sales?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin/sales?saved=salesperson_updated');
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
  if (!name) redirect('/admin/production?error=missing_name');

  const supabase = await serverClient();
  const { error } = await supabase.from('crew_members').insert({
    name,
    home_crew_id: homeCrewId,
    is_foreman: isForeman,
    display_order: displayOrder,
    is_active: true,
  });
  if (error) redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin/production?saved=crew_member_added');
}

// ----------------------------------------------------------------------------
// 6. Production: annual goal
// ----------------------------------------------------------------------------
export async function saveAnnualProductionGoal(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const goal = parseMoney(formData.get('annual_production_goal'));
  if (year == null || goal == null) {
    redirect('/admin/production?error=invalid_annual_production_goal');
  }

  const supabase = await serverClient();
  // Use upsert; if a row exists, only update the production column.
  const { data: existing } = await supabase
    .from('yearly_targets')
    .select('year, annual_goal')
    .eq('year', year!)
    .maybeSingle();
  const { error } = await supabase
    .from('yearly_targets')
    .upsert(
      {
        year: year!,
        annual_goal: existing?.annual_goal ?? 0,
        annual_production_goal: goal!,
      },
      { onConflict: 'year' },
    );
  if (error)
    redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin/production?saved=annual_production');
}

// ----------------------------------------------------------------------------
// 7. Production: monthly crew budgets
// ----------------------------------------------------------------------------
export async function saveCrewBudgets(formData: FormData): Promise<void> {
  await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const month = parseIntStrict(formData.get('month'));
  if (year == null || month == null) {
    redirect('/admin/production?error=invalid_crew_budgets');
  }

  type Row = { year: number; month: number; crew_id: string; budget_revenue: number };
  const rows: Row[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('budget__')) continue;
    const crew_id = key.slice('budget__'.length);
    const amt = parseMoney(value);
    if (amt == null) {
      redirect('/admin/production?error=invalid_budget');
    }
    rows.push({ year: year!, month: month!, crew_id, budget_revenue: amt! });
  }
  if (rows.length === 0) {
    redirect(`/admin/production?year=${year}&month=${month}&error=no_rows`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('crew_monthly_budgets')
    .upsert(rows, { onConflict: 'year,month,crew_id' });
  if (error)
    redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect(`/admin/production?year=${year}&month=${month}&saved=crew_budgets`);
}

// ----------------------------------------------------------------------------
// 8. Production: monthly historicals
// ----------------------------------------------------------------------------
export async function saveProductionHistoricals(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const month = parseIntStrict(formData.get('month'));
  if (year == null || month == null) {
    redirect('/admin/production?error=invalid_prod_historicals');
  }

  type Pair = { jobs?: number; revenue?: number };
  const byCrew = new Map<string, Pair>();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('histjobs__')) {
      const id = key.slice('histjobs__'.length);
      const n = Number(String(value).trim().replace(/[\s,]/g, '') || '0');
      if (!Number.isInteger(n) || n < 0) {
        redirect('/admin/production?error=invalid_jobs');
      }
      byCrew.set(id, { ...(byCrew.get(id) ?? {}), jobs: n });
    } else if (key.startsWith('histrev__')) {
      const id = key.slice('histrev__'.length);
      const n = parseMoney(value);
      if (n == null) {
        redirect('/admin/production?error=invalid_revenue');
      }
      byCrew.set(id, { ...(byCrew.get(id) ?? {}), revenue: n! });
    }
  }
  if (byCrew.size === 0) {
    redirect(`/admin/production?year=${year}&month=${month}&error=no_rows`);
  }

  type Row = {
    year: number;
    month: number;
    crew_id: string;
    jobs: number;
    revenue: number;
    source_note: string;
    created_by: string;
  };
  const rows: Row[] = [];
  for (const [crew_id, p] of byCrew.entries()) {
    rows.push({
      year: year!,
      month: month!,
      crew_id,
      jobs: p.jobs ?? 0,
      revenue: p.revenue ?? 0,
      source_note: 'Edited via admin form',
      created_by: user.email,
    });
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('production_monthly_historicals')
    .upsert(rows, { onConflict: 'year,month,crew_id' });
  if (error)
    redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect(
    `/admin/production?year=${year}&month=${month}&saved=prod_historicals`,
  );
}

export async function updateCrewMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const homeCrewId = String(formData.get('home_crew_id') ?? '') || null;
  const isForeman = formData.get('is_foreman') === 'on';
  const isActive = formData.get('is_active') === 'on';
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 0;
  if (!id || !name) redirect('/admin/production?error=missing_fields');

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
  if (error) redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  refreshAffectedPages();
  redirect('/admin/production?saved=crew_member_updated');
}

// ----------------------------------------------------------------------------
// 9. Allowed emails (access management)
// ----------------------------------------------------------------------------
// Safety rule: an admin cannot remove their own row or demote themselves to
// 'user'. Otherwise they could lock themselves out of the dashboard with no
// way back in short of opening Supabase.

function normalizeEmail(raw: FormDataEntryValue | null): string {
  return String(raw ?? '').trim().toLowerCase();
}

export async function addAllowedEmail(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = normalizeEmail(formData.get('email'));
  const role = String(formData.get('role') ?? 'user');
  if (!email || !email.includes('@')) {
    redirect(`/admin/access?error=${encodeURIComponent('Enter a valid email address.')}`);
  }
  const VALID_ROLES = [
    'admin',
    'user',
    'sales_manager',
    'sales_arborist',
    'field_crew',
  ];
  if (!VALID_ROLES.includes(role)) {
    redirect(`/admin/access?error=${encodeURIComponent('Invalid role.')}`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('allowed_emails')
    .insert({ email, role });
  if (error) redirect(`/admin/access?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin/access');
  redirect('/admin/access?saved=email_added');
}

export async function updateAllowedEmailRole(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const email = normalizeEmail(formData.get('email'));
  const role = String(formData.get('role') ?? '');
  if (!email) redirect(`/admin/access?error=${encodeURIComponent('Missing email.')}`);
  const VALID_ROLES = [
    'admin',
    'user',
    'sales_manager',
    'sales_arborist',
    'field_crew',
  ];
  if (!VALID_ROLES.includes(role)) {
    redirect(`/admin/access?error=${encodeURIComponent('Invalid role.')}`);
  }
  if (email === me.email.toLowerCase() && role !== 'admin') {
    redirect(`/admin/access?error=${encodeURIComponent("You can't demote yourself — ask another admin to do it.")}`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('allowed_emails')
    .update({ role })
    .ilike('email', email);
  if (error) redirect(`/admin/access?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin/access');
  redirect('/admin/access?saved=role_updated');
}

export async function removeAllowedEmail(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const email = normalizeEmail(formData.get('email'));
  if (!email) redirect(`/admin/access?error=${encodeURIComponent('Missing email.')}`);
  if (email === me.email.toLowerCase()) {
    redirect(`/admin/access?error=${encodeURIComponent("You can't remove yourself — ask another admin to do it.")}`);
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('allowed_emails')
    .delete()
    .ilike('email', email);
  if (error) redirect(`/admin/access?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/admin/access');
  redirect('/admin/access?saved=email_removed');
}

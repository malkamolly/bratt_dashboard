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

/**
 * Upload a photo for a salesperson and store the public URL on their row.
 * Called from a client component (not a form-action submission) so the UI can
 * show inline progress / errors and refresh on success.
 */
export async function uploadSalespersonPhoto(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { error: 'Missing salesperson id.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file provided.' };
  if (file.size > 8 * 1024 * 1024) return { error: 'File is larger than 8 MB.' };
  if (!file.type.startsWith('image/')) return { error: 'File must be an image.' };

  const extFromName = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : '';
  const extFromMime = file.type.split('/').pop()!.toLowerCase();
  const ext = extFromName || extFromMime || 'png';
  const filename = `${id}/${Date.now()}.${ext}`;

  const supabase = await serverClient();
  const { error: uploadError } = await supabase.storage
    .from('salesperson-photos')
    .upload(filename, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: uploadError.message };

  const { data: pub } = supabase.storage
    .from('salesperson-photos')
    .getPublicUrl(filename);

  const { error: updateError } = await supabase
    .from('salespeople')
    .update({ photo_url: pub.publicUrl })
    .eq('id', id);
  if (updateError) return { error: updateError.message };

  refreshAffectedPages();
  revalidatePath('/hub/arborists');
  revalidatePath('/hub/arborists/[slug]', 'page');
  revalidatePath('/sales/[salespersonId]', 'page');
  return { url: pub.publicUrl };
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
// Adds a new field crew employee from the production-admin form. The
// Field Crew Hub manages name/position/skills/etc. via /admin/crew; this
// is the lightweight form that only sets the operational fields (home
// crew + foreman + display order). Generates a slug from the name; the
// admin can rename via /admin/crew/employees later.
export async function addCrewMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  const homeCrewId = String(formData.get('home_crew_id') ?? '') || null;
  const isForeman = formData.get('is_foreman') === 'on';
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 999;
  const authEmail =
    String(formData.get('auth_email') ?? '').trim().toLowerCase() || null;
  if (!name) redirect('/admin/production?error=missing_name');
  if (authEmail && !authEmail.includes('@')) {
    redirect('/admin/production?error=invalid_email');
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!slug) redirect('/admin/production?error=invalid_name');

  // Code: first letter of first and last word, plus a stable 4-char hash
  // so two people with the same initials don't collide.
  const words = name.split(/\s+/).filter(Boolean);
  const initials =
    (words[0]?.[0] ?? '') + (words[words.length - 1]?.[0] ?? '');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const code = `${initials.toUpperCase()}-${Math.abs(hash).toString(16).slice(0, 4).toUpperCase()}`;

  const supabase = await serverClient();
  const { error } = await supabase.from('field_crew_employees').insert({
    slug,
    code,
    name,
    home_crew_id: homeCrewId,
    leads_crew: isForeman,
    display_order: displayOrder,
    active: true,
    auth_email: authEmail,
  });
  if (error) redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  if (authEmail) await ensureFieldCrewAllowlist(authEmail);

  refreshAffectedPages();
  redirect('/admin/production?saved=crew_member_added');
}

// If an admin sets a sign-in email on a crew member, make sure that email is
// also on the allowlist so they can actually sign in. Insert only — if a row
// already exists (e.g. they're already an admin), leave its role alone.
async function ensureFieldCrewAllowlist(email: string): Promise<void> {
  const supabase = await serverClient();
  const { data: existing } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (existing) return;
  await supabase
    .from('allowed_emails')
    .insert({ email, role: 'field_crew' });
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
// 8. Production: monthly historicals (per crew member)
// ----------------------------------------------------------------------------
// Mirrors the daily entry form: admins type jobs + revenue per member, plus
// direct crew totals for crews with no members. We save the per-member rows
// to `production_member_historicals` (used for member-level audit display)
// AND a rolled-up per-crew row to `production_monthly_historicals` (which is
// what the dashboard reads to recognize a "closed" historical month).
// Replacement strategy: delete the month's existing rows in both tables, then
// re-insert. Keeps state idempotent and handles members moving crews / data
// being cleared.
// ----------------------------------------------------------------------------
export type ProdHistoricalsSaveResult =
  | { ok: false; error: string }
  | undefined;

type MemberInput = { jobs: number; revenue: number; crewId: string };
type CrewInput = { jobs: number; revenue: number };

function parseJobsCount(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return 0;
  const n = Number(s.replace(/[\s,]/g, ''));
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export async function saveProductionMemberHistoricals(
  _prev: ProdHistoricalsSaveResult,
  formData: FormData,
): Promise<ProdHistoricalsSaveResult> {
  const user = await requireAdmin();
  const year = parseIntStrict(formData.get('year'));
  const month = parseIntStrict(formData.get('month'));
  if (year == null || month == null) {
    return { ok: false, error: 'Missing year or month.' };
  }

  const memberInputs = new Map<string, MemberInput>();
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

  const { error: delMembersErr } = await supabase
    .from('production_member_historicals')
    .delete()
    .eq('year', year!)
    .eq('month', month!);
  if (delMembersErr) return { ok: false, error: delMembersErr.message };

  const { error: delCrewsErr } = await supabase
    .from('production_monthly_historicals')
    .delete()
    .eq('year', year!)
    .eq('month', month!);
  if (delCrewsErr) return { ok: false, error: delCrewsErr.message };

  const memberRows: Array<{
    year: number;
    month: number;
    employee_slug: string;
    crew_id: string;
    jobs: number;
    revenue: number;
    source_note: string;
    created_by: string;
  }> = [];
  for (const [id, input] of memberInputs.entries()) {
    if (!input.crewId) continue;
    if (input.jobs === 0 && input.revenue === 0) continue;
    memberRows.push({
      year: year!,
      month: month!,
      employee_slug: id,
      crew_id: input.crewId,
      jobs: input.jobs,
      revenue: input.revenue,
      source_note: 'Edited via admin form',
      created_by: user.email,
    });
  }
  if (memberRows.length > 0) {
    const { error } = await supabase
      .from('production_member_historicals')
      .insert(memberRows);
    if (error) return { ok: false, error: error.message };
  }

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

  const crewRows = Array.from(crewTotals.entries()).map(([crew_id, t]) => ({
    year: year!,
    month: month!,
    crew_id,
    jobs: t.jobs,
    revenue: t.revenue,
    source_note: 'Edited via admin form',
    created_by: user.email,
  }));
  if (crewRows.length > 0) {
    const { error } = await supabase
      .from('production_monthly_historicals')
      .insert(crewRows);
    if (error) return { ok: false, error: error.message };
  }

  refreshAffectedPages();
  redirect(
    `/admin/production?year=${year}&month=${month}&saved=prod_historicals`,
  );
}

export async function updateCrewMember(formData: FormData): Promise<void> {
  await requireAdmin();
  const slug = String(formData.get('slug') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const homeCrewId = String(formData.get('home_crew_id') ?? '') || null;
  const isForeman = formData.get('is_foreman') === 'on';
  const isActive = formData.get('is_active') === 'on';
  const displayOrder = parseIntStrict(formData.get('display_order')) ?? 0;
  const authEmail =
    String(formData.get('auth_email') ?? '').trim().toLowerCase() || null;
  if (!slug || !name) redirect('/admin/production?error=missing_fields');
  if (authEmail && !authEmail.includes('@')) {
    redirect('/admin/production?error=invalid_email');
  }

  const supabase = await serverClient();
  const { error } = await supabase
    .from('field_crew_employees')
    .update({
      name,
      home_crew_id: homeCrewId,
      leads_crew: isForeman,
      active: isActive,
      display_order: displayOrder,
      auth_email: authEmail,
    })
    .eq('slug', slug);
  if (error) redirect(`/admin/production?error=${encodeURIComponent(error.message)}`);

  if (authEmail) await ensureFieldCrewAllowlist(authEmail);

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

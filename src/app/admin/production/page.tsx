import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { fmtUsd, monthLabel } from '@/lib/format';
import { MonthPicker } from '@/components/MonthPicker';
import { SectionCard, FlashBanner } from '@/components/admin-shared';
import {
  addCrewMember,
  updateCrewMember,
  saveAnnualProductionGoal,
  saveCrewBudgets,
} from '../actions';
import { HistoricalsForm } from './HistoricalsForm';
import type { Crew, CrewMember } from '@/types';

export const dynamic = 'force-dynamic';

type Search = Promise<{
  year?: string;
  month?: string;
  saved?: string;
  error?: string;
  show_inactive?: string;
}>;

function parseIntInRange(raw: string | undefined, min: number, max: number) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export default async function ProductionAdminPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/access-denied');

  const sp = await searchParams;
  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;
  const showInactive = sp.show_inactive === '1';

  const supabase = await serverClient();
  const [
    crewsAllRes,
    crewMembersRes,
    yearlyTargetRes,
    budgetsRes,
    memberHistoricalsRes,
    crewHistoricalsRes,
  ] = await Promise.all([
    supabase
      .from('crews')
      .select('id, name, kind, display_order, is_active')
      .order('display_order'),
    supabase
      .from('field_crew_employees')
      .select('slug, name, home_crew_id, leads_crew, display_order, active, auth_email')
      .order('display_order'),
    supabase
      .from('yearly_targets')
      .select('annual_production_goal')
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('crew_monthly_budgets')
      .select('crew_id, budget_revenue')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('production_member_historicals')
      .select('employee_slug, crew_id, jobs, revenue')
      .eq('year', year)
      .eq('month', month),
    supabase
      .from('production_monthly_historicals')
      .select('crew_id, jobs, revenue')
      .eq('year', year)
      .eq('month', month),
  ]);

  const crewsAll = (crewsAllRes.data ?? []) as Crew[];
  const activeCrews = crewsAll.filter(
    (c) => c.is_active && c.kind !== 'unassigned',
  );
  // Historicals: include the Unassigned bucket so members assigned to it
  // (and any historical jobs/revenue logged against it) still show up.
  const historicalsCrews = crewsAll.filter((c) => c.is_active);
  type FceRow = {
    slug: string;
    name: string;
    home_crew_id: string | null;
    leads_crew: boolean;
    display_order: number;
    active: boolean;
    auth_email: string | null;
  };
  const fceToCrewMember = (r: FceRow): CrewMember => ({
    slug: r.slug,
    name: r.name,
    home_crew_id: r.home_crew_id,
    is_foreman: r.leads_crew,
    display_order: r.display_order,
    is_active: r.active,
    auth_email: r.auth_email,
  });
  const crewMembers: CrewMember[] = ((crewMembersRes.data ?? []) as FceRow[])
    .map(fceToCrewMember)
    // Active members first, inactive sorted to the bottom. Within each
    // group, preserve the display_order coming back from the query.
    .sort((a, b) => Number(b.is_active) - Number(a.is_active));
  const annualProductionGoal = yearlyTargetRes.data?.annual_production_goal
    ? Number(yearlyTargetRes.data.annual_production_goal)
    : null;
  const budgetsByCrew: Record<string, number> = {};
  for (const b of budgetsRes.data ?? []) {
    budgetsByCrew[b.crew_id as string] = Number(b.budget_revenue);
  }
  const memberHistRows = memberHistoricalsRes.data ?? [];
  const histByMember: Record<
    string,
    { crew_id: string; jobs: number; revenue: number }
  > = {};
  for (const h of memberHistRows) {
    histByMember[h.employee_slug as string] = {
      crew_id: h.crew_id as string,
      jobs: Number(h.jobs),
      revenue: Number(h.revenue),
    };
  }
  // Crews with rolled-up historicals but no member-level rows (legacy or
  // crews without crew_members) — pass these in as direct crew-level inputs.
  const memberCrewIds = new Set(memberHistRows.map((r) => r.crew_id as string));
  const histByCrewDirect: Record<string, { jobs: number; revenue: number }> = {};
  for (const h of crewHistoricalsRes.data ?? []) {
    const cid = h.crew_id as string;
    if (memberCrewIds.has(cid)) continue;
    histByCrewDirect[cid] = {
      jobs: Number(h.jobs),
      revenue: Number(h.revenue),
    };
  }
  // For the historicals form we want active members PLUS any inactive members
  // who already have data for this month (so old data stays editable).
  const memberSlugsWithData = new Set(
    memberHistRows.map((r) => r.employee_slug as string),
  );
  const allMembers: CrewMember[] = ((crewMembersRes.data ?? []) as FceRow[]).map(
    fceToCrewMember,
  );
  const historicalsMembers = allMembers.filter(
    (m) => m.is_active || memberSlugsWithData.has(m.slug),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Production
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        Production Admin
      </h1>
      <p className="mt-3 text-fg-2">
        Annual goal, monthly crew budgets, historical totals, and crew roster.
        Crew Budgets and Historicals each have their own month picker.
      </p>

      <FlashBanner saved={sp.saved} error={sp.error} />

      <div className="mt-10 space-y-12">
        <AnnualProductionGoalSection
          year={year}
          currentValue={annualProductionGoal}
        />
        <CrewBudgetsSection
          year={year}
          month={month}
          crews={activeCrews}
          budgets={budgetsByCrew}
        />
        <ProductionHistoricalsSection
          year={year}
          month={month}
          crews={historicalsCrews}
          members={historicalsMembers}
          memberValues={histByMember}
          crewValues={histByCrewDirect}
        />
        <div id="crew-members" className="scroll-mt-20">
          <CrewMembersSection
            crewMembers={crewMembers}
            crews={crewsAll.filter((c) => c.is_active)}
            showInactive={showInactive}
          />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Section 1: Annual production goal
// ---------------------------------------------------------------------------
function AnnualProductionGoalSection({
  year,
  currentValue,
}: {
  year: number;
  currentValue: number | null;
}) {
  return (
    <SectionCard
      eyebrow="1 — Annual"
      title={`Annual Production Goal (${year})`}
      description="The big yearly production-revenue number. Powers the YTD progress bar on the Production PACE dashboard."
    >
      <form
        action={saveAnnualProductionGoal}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="year" value={year} />
        <label className="flex-1">
          <span className="bt-eyebrow">Annual Goal ($)</span>
          <input
            type="text"
            inputMode="decimal"
            name="annual_production_goal"
            defaultValue={currentValue != null ? String(currentValue) : ''}
            placeholder="e.g. 12000000"
            className="mt-1 w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>
        <button type="submit" className="bt-btn bt-btn-primary">
          Save Annual Goal
        </button>
      </form>
      {currentValue != null && currentValue > 0 && (
        <p className="mt-3 text-sm text-fg-3">
          Currently set to <strong>{fmtUsd(currentValue)}</strong>.
        </p>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Section 2: Monthly crew budgets
// ---------------------------------------------------------------------------
function CrewBudgetsSection({
  year,
  month,
  crews,
  budgets,
}: {
  year: number;
  month: number;
  crews: Crew[];
  budgets: Record<string, number>;
}) {
  return (
    <SectionCard
      eyebrow="2 — Budgets"
      title={`Crew Budgets — ${monthLabel(year, month)}`}
      description="Monthly revenue budget per crew. Drives the % of Budget column and Behind/Ahead status pills on the dashboard."
      headerRight={<MonthPicker year={year} month={month} basePath="/admin/production" />}
    >
      <form action={saveCrewBudgets} className="space-y-4">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {crews.map((c) => {
            const v = budgets[c.id];
            return (
              <label
                key={c.id}
                className="flex items-center gap-3 rounded-2 border-2 border-paper-edge bg-white px-3 py-2"
              >
                <span className="w-32 font-headline text-sm font-bold text-ink">
                  {c.name}
                </span>
                <span className="text-fg-3">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name={`budget__${c.id}`}
                  defaultValue={v != null && v !== 0 ? String(v) : ''}
                  placeholder="0"
                  className="flex-1 rounded-1 border border-transparent bg-transparent px-1 py-1 font-headline text-right focus:border-orange focus:outline-none"
                />
              </label>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button type="submit" className="bt-btn bt-btn-primary">
            Save Crew Budgets
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Section 3: Production historicals (per crew member jobs + revenue)
// ---------------------------------------------------------------------------
// Mirrors the daily entry form layout: one card per crew, with each crew
// member's jobs + revenue input inside. Rolls up to per-crew totals live as
// admins type, and to a Month Total at the bottom.
function ProductionHistoricalsSection({
  year,
  month,
  crews,
  members,
  memberValues,
  crewValues,
}: {
  year: number;
  month: number;
  crews: Crew[];
  members: CrewMember[];
  memberValues: Record<string, { crew_id: string; jobs: number; revenue: number }>;
  crewValues: Record<string, { jobs: number; revenue: number }>;
}) {
  const hasAny =
    Object.keys(memberValues).length > 0 ||
    Object.values(crewValues).some((v) => v.revenue > 0 || v.jobs > 0);
  return (
    <SectionCard
      eyebrow="3 — Historicals"
      title={`Monthly Totals — ${monthLabel(year, month)}`}
      description="A closed month's jobs and revenue per crew member. Type each member's monthly numbers; crew totals roll up live. Saving here marks the month as 'historical' on the dashboard."
      headerRight={<MonthPicker year={year} month={month} basePath="/admin/production" />}
    >
      {!hasAny && (
        <p className="mb-4 rounded-2 border-2 border-dashed border-paper-edge bg-white/60 px-3 py-2 text-xs text-fg-2">
          No historicals saved for {monthLabel(year, month)} yet.
        </p>
      )}
      <HistoricalsForm
        key={`${year}-${month}`}
        year={year}
        month={month}
        crews={crews}
        members={members}
        initialMemberRows={memberValues}
        initialCrewRows={crewValues}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Section 4: Crew member roster (table layout)
// ---------------------------------------------------------------------------
function CrewMembersSection({
  crewMembers,
  crews,
  showInactive,
}: {
  crewMembers: CrewMember[];
  crews: Crew[];
  showInactive: boolean;
}) {
  const inactiveCount = crewMembers.filter((m) => !m.is_active).length;
  const visibleMembers = showInactive
    ? crewMembers
    : crewMembers.filter((m) => m.is_active);
  return (
    <SectionCard
      eyebrow="4 — Crew Roster"
      title="Crew Members"
      description="Production team members and their home crew. The home crew is where they appear by default on the daily entry form; they can be moved to another crew for an individual day from the form. Set a sign-in email to give a crew member access to the Field Crew Hub — that email will also be added to the Access allowlist with the Field Crew role."
      headerRight={
        inactiveCount > 0 ? (
          <Link
            href={
              showInactive
                ? '/admin/production#crew-members'
                : '/admin/production?show_inactive=1#crew-members'
            }
            className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
          >
            {showInactive
              ? `Hide inactive (${inactiveCount})`
              : `Show inactive (${inactiveCount})`}
          </Link>
        ) : undefined
      }
    >
      <RosterTable
        crews={crews}
        members={visibleMembers}
      />
      <div className="mt-6 rounded-2 border-2 border-dashed border-paper-edge p-3">
        <p className="bt-eyebrow">Add Crew Member</p>
        <form
          action={addCrewMember}
          className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <label className="flex-1 min-w-[8rem]">
            <span className="text-xs text-fg-2">Name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Alex R"
              className="mt-1 w-full rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
            />
          </label>
          <label className="flex-1 min-w-[10rem]">
            <span className="text-xs text-fg-2">Sign-in email (optional)</span>
            <input
              type="email"
              name="auth_email"
              placeholder="name@bratttree.com"
              className="mt-1 w-full rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
            />
          </label>
          <label>
            <span className="text-xs text-fg-2">Crew</span>
            <select
              name="home_crew_id"
              className="mt-1 rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-sm focus:border-orange focus:outline-none"
            >
              <option value="">— Unassigned —</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs text-fg-2">Order</span>
            <input
              type="number"
              name="display_order"
              defaultValue={
                (crewMembers[crewMembers.length - 1]?.display_order ?? 100) + 10
              }
              className="mt-1 w-20 rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-sm text-right focus:border-orange focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 sm:pb-1.5">
            <input type="checkbox" name="is_foreman" className="h-4 w-4" />
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
              Foreman
            </span>
          </label>
          <button type="submit" className="bt-btn bt-btn-primary">
            Add
          </button>
        </form>
      </div>
    </SectionCard>
  );
}

function RosterTable({
  crews,
  members,
}: {
  crews: Crew[];
  members: CrewMember[];
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-[minmax(8rem,1.3fr)_minmax(7rem,1fr)_minmax(10rem,1.4fr)_3.5rem_2.5rem_2.5rem_auto] items-center gap-1.5 text-xs">
        {/* Header */}
        <div className="bt-eyebrow text-fg-3">Name</div>
        <div className="bt-eyebrow text-fg-3">Crew</div>
        <div className="bt-eyebrow text-fg-3">Sign-in email</div>
        <div className="bt-eyebrow text-fg-3 text-right">Order</div>
        <div className="bt-eyebrow text-fg-3 text-center">F</div>
        <div className="bt-eyebrow text-fg-3 text-center">Active</div>
        <div />

        {members.map((mb) => (
          <form
            key={mb.slug}
            action={updateCrewMember}
            className={
              mb.is_active
                ? 'contents [&>*]:my-0.5'
                : 'contents [&>*]:my-0.5 [&>*]:opacity-60'
            }
          >
            <input type="hidden" name="slug" value={mb.slug} />
            <input
              type="text"
              name="name"
              defaultValue={mb.name}
              className="rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none"
            />
            <select
              name="home_crew_id"
              defaultValue={mb.home_crew_id ?? ''}
              className="rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none"
            >
              <option value="">— Unassigned —</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="email"
              name="auth_email"
              defaultValue={mb.auth_email ?? ''}
              placeholder="name@bratttree.com"
              className="rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none"
            />
            <input
              type="number"
              name="display_order"
              defaultValue={mb.display_order}
              className="rounded-1 border border-paper-edge bg-bone px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
            />
            <div className="flex justify-center">
              <input
                type="checkbox"
                name="is_foreman"
                defaultChecked={mb.is_foreman}
                className="h-4 w-4"
              />
            </div>
            <div className="flex justify-center">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={mb.is_active}
                className="h-4 w-4"
              />
            </div>
            <button
              type="submit"
              className="rounded-full border-2 border-ink px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-ink transition-colors hover:bg-ink hover:text-cream"
            >
              Save
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

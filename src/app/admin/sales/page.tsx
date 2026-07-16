import type { ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { fmtUsd, monthLabel } from '@/lib/format';
import { MonthPicker } from '@/components/MonthPicker';
import { SectionCard, FlashBanner } from '@/components/admin-shared';
import { SalespersonPhotoUpload } from '@/components/SalespersonPhotoUpload';
import {
  saveAnnualGoal,
  saveMonthlyGoals,
  saveHistoricals,
  addSalesperson,
  updateSalesperson,
} from '../actions';
import type { Salesperson } from '@/types';

export const dynamic = 'force-dynamic';

type Search = Promise<{
  year?: string;
  month?: string;
  saved?: string;
  error?: string;
}>;

function parseIntInRange(raw: string | undefined, min: number, max: number) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export default async function SalesAdminPage({
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

  const supabase = await serverClient();
  const [salespeopleRes, yearlyTargetRes, monthSettingsRes, historicalsRes] =
    await Promise.all([
      supabase
        .from('salespeople')
        .select(
          'id, name, display_order, is_active, photo_url, last_initial, title, certified, isa_number, is_manager, on_roster',
        )
        .order('display_order'),
      supabase
        .from('yearly_targets')
        .select('annual_goal')
        .eq('year', year)
        .maybeSingle(),
      supabase
        .from('sales_monthly_settings')
        .select('company_goal, per_person_goals')
        .eq('year', year)
        .eq('month', month)
        .maybeSingle(),
      supabase
        .from('sales_monthly_historicals')
        .select('salesperson_id, amount')
        .eq('year', year)
        .eq('month', month),
    ]);

  const salespeople = (salespeopleRes.data ?? []) as Salesperson[];
  const activeSalespeople = salespeople.filter((s) => s.is_active);
  const annualGoal = yearlyTargetRes.data?.annual_goal
    ? Number(yearlyTargetRes.data.annual_goal)
    : null;
  const companyGoal = monthSettingsRes.data?.company_goal
    ? Number(monthSettingsRes.data.company_goal)
    : 0;
  const perPersonGoals = (monthSettingsRes.data?.per_person_goals ?? {}) as Record<
    string,
    number | string
  >;
  const historicalsByPerson: Record<string, number> = {};
  for (const h of historicalsRes.data ?? []) {
    historicalsByPerson[h.salesperson_id as string] = Number(h.amount);
  }

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Sales
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        Sales Admin
      </h1>
      <p className="mt-3 text-fg-2">
        Annual goal, monthly goals, historical totals, and the salesperson
        roster. Goals and Historicals each have their own month picker.
      </p>

      <FlashBanner saved={sp.saved} error={sp.error} />

      <div className="mt-10 space-y-12">
        <AnnualGoalSection year={year} currentValue={annualGoal} />
        <MonthlyGoalsSection
          year={year}
          month={month}
          companyGoal={companyGoal}
          perPersonGoals={perPersonGoals}
          salespeople={activeSalespeople}
        />
        <HistoricalsSection
          year={year}
          month={month}
          values={historicalsByPerson}
          salespeople={activeSalespeople}
        />
        <RosterSection salespeople={salespeople} />
      </div>
    </main>
  );
}

function AnnualGoalSection({
  year,
  currentValue,
}: {
  year: number;
  currentValue: number | null;
}) {
  return (
    <SectionCard
      eyebrow="1 — Annual"
      title={`Annual Sales Goal (${year})`}
      description="The big yearly number. Powers the YTD progress bar on the Sales PACE dashboard."
    >
      <form key={`annual-${year}`} action={saveAnnualGoal} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="year" value={year} />
        <label className="flex-1">
          <span className="bt-eyebrow">Annual Goal ($)</span>
          <input
            type="text"
            inputMode="decimal"
            name="annual_goal"
            defaultValue={currentValue != null ? String(currentValue) : ''}
            placeholder="e.g. 13200000"
            className="mt-1 w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>
        <button type="submit" className="bt-btn bt-btn-primary">
          Save Annual Goal
        </button>
      </form>
      {currentValue != null && (
        <p className="mt-3 text-sm text-fg-3">
          Currently set to <strong>{fmtUsd(currentValue)}</strong>.
        </p>
      )}
    </SectionCard>
  );
}

function MonthlyGoalsSection({
  year,
  month,
  companyGoal,
  perPersonGoals,
  salespeople,
}: {
  year: number;
  month: number;
  companyGoal: number;
  perPersonGoals: Record<string, number | string>;
  salespeople: Salesperson[];
}) {
  return (
    <SectionCard
      eyebrow="2 — Goals"
      title={`Monthly Goals — ${monthLabel(year, month)}`}
      description="Company-wide goal plus an optional per-salesperson target. Per-person goals show as '% of Goal' columns on the dashboard."
      headerRight={<MonthPicker year={year} month={month} basePath="/admin/sales" />}
    >
      {/* key forces the form (and its uncontrolled inputs) to remount when the
          month/year changes, so each field picks up the new defaultValue instead
          of keeping the previously displayed month's values. */}
      <form key={`goals-${year}-${month}`} action={saveMonthlyGoals} className="space-y-5">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />

        <label className="block">
          <span className="bt-eyebrow">Company Goal ($)</span>
          <input
            type="text"
            inputMode="decimal"
            name="company_goal"
            defaultValue={companyGoal > 0 ? String(companyGoal) : ''}
            placeholder="e.g. 1100000"
            className="mt-1 w-full max-w-sm rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>

        <div>
          <p className="bt-eyebrow">Per-Salesperson Goals (optional)</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {salespeople.map((sp) => {
              const raw = perPersonGoals[sp.id];
              const val = raw != null ? String(Number(raw)) : '';
              return (
                <label
                  key={sp.id}
                  className="flex items-center gap-3 rounded-2 border-2 border-paper-edge bg-white px-3 py-2"
                >
                  <span className="w-28 font-headline text-sm font-bold text-ink">
                    {sp.name}
                  </span>
                  <span className="text-fg-3">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`goal__${sp.id}`}
                    defaultValue={val}
                    placeholder="TBD"
                    className="flex-1 rounded-1 border border-transparent bg-transparent px-1 py-1 font-headline text-right focus:border-orange focus:outline-none"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="bt-btn bt-btn-primary">
            Save Monthly Goals
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function HistoricalsSection({
  year,
  month,
  values,
  salespeople,
}: {
  year: number;
  month: number;
  values: Record<string, number>;
  salespeople: Salesperson[];
}) {
  const hasAny = Object.values(values).some((v) => v > 0);
  return (
    <SectionCard
      eyebrow="3 — Historicals"
      title={`Monthly Totals — ${monthLabel(year, month)}`}
      description="A closed month's rolled-up total per salesperson. Saving here marks the month as 'historical' on the dashboard."
      headerRight={<MonthPicker year={year} month={month} basePath="/admin/sales" />}
    >
      {!hasAny && (
        <p className="mb-4 rounded-2 border-2 border-dashed border-paper-edge bg-white/60 px-3 py-2 text-xs text-fg-2">
          No historicals saved for {monthLabel(year, month)} yet. Fill in any
          amounts and save.
        </p>
      )}
      {/* Same remount-on-month-change fix as the goals form above. */}
      <form key={`hist-${year}-${month}`} action={saveHistoricals} className="space-y-4">
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {salespeople.map((sp) => {
            const v = values[sp.id];
            return (
              <label
                key={sp.id}
                className="flex items-center gap-3 rounded-2 border-2 border-paper-edge bg-white px-3 py-2"
              >
                <span className="w-28 font-headline text-sm font-bold text-ink">
                  {sp.name}
                </span>
                <span className="text-fg-3">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name={`hist__${sp.id}`}
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
            Save Historicals
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

// Small reusable field label + input pair for the roster forms.
function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="bt-eyebrow text-fg-3">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'h-8 rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline text-sm focus:border-orange focus:outline-none';

// Tell password managers (1Password, LastPass, Bitwarden, etc.) not to treat
// these roster fields as logins. Without this they inject a "fill" icon into
// the first text field, which both looks wrong and nudges that field's height
// so its label no longer lines up with the others.
const ignorePasswordManagers = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const;

function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="text"
      {...ignorePasswordManagers}
      {...props}
      className={`${inputCls} ${className ?? ''}`}
    />
  );
}

function RosterSection({ salespeople }: { salespeople: Salesperson[] }) {
  return (
    <SectionCard
      eyebrow="4 — Roster"
      title="Salespeople"
      description="Add a salesperson here and they automatically appear on the Arborist Hub Team Roster too. First name is what sales attribution matches on; Last Initial, Title, Certified and ISA # are what show on the roster card. Flipping 'Active' off hides them from new entries while keeping their history. 'Other' and 'Add-Ons' are attribution buckets, not people, so they stay off the roster."
    >
      <div className="space-y-3">
        {salespeople.map((sp) => {
          const photo = sp.photo_url ?? null;
          return (
            <form
              key={sp.id}
              action={updateSalesperson}
              className="rounded-2 border-2 border-paper-edge bg-white p-3"
            >
              <input type="hidden" name="id" value={sp.id} />
              {/* items-start anchors every field's label to the top row, so a
                  password manager injecting an icon into a field can't shove
                  that field's label out of line — the icon just lands below. */}
              <div className="flex flex-wrap items-start gap-3">
                <div className="mt-5">
                  <SalespersonPhotoUpload
                    salespersonId={sp.id}
                    currentPhotoUrl={photo}
                    fallbackInitial={sp.name.slice(0, 1)}
                  />
                </div>
                <Field label="First Name">
                  <TextInput name="name" defaultValue={sp.name} className="w-32" />
                </Field>
                <Field label="Last Initial">
                  <TextInput
                    name="last_initial"
                    maxLength={3}
                    defaultValue={sp.last_initial ?? ''}
                    placeholder="e.g. P"
                    className="w-16"
                  />
                </Field>
                <Field label="Title">
                  <TextInput
                    name="title"
                    defaultValue={sp.title ?? 'Sales Arborist'}
                    className="w-40"
                  />
                </Field>
                <Field label="ISA #">
                  <TextInput
                    name="isa_number"
                    defaultValue={sp.isa_number ?? ''}
                    placeholder="optional"
                    className="w-32"
                  />
                </Field>
                <Field label="Order">
                  <input
                    type="number"
                    name="display_order"
                    defaultValue={sp.display_order}
                    className={`${inputCls} w-16 text-right`}
                  />
                </Field>
                <label className="mt-5 flex items-center gap-1.5">
                  <input type="checkbox" name="certified" defaultChecked={!!sp.certified} className="h-4 w-4" />
                  <span className="text-xs text-fg-2">Certified</span>
                </label>
                <label className="mt-5 flex items-center gap-1.5">
                  <input type="checkbox" name="is_active" defaultChecked={sp.is_active} className="h-4 w-4" />
                  <span className="text-xs text-fg-2">Active</span>
                </label>
                <button
                  type="submit"
                  className="ml-auto mt-5 rounded-full border-2 border-ink px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-ink transition-colors hover:bg-ink hover:text-cream"
                >
                  Save
                </button>
              </div>
              {sp.on_roster === false && (
                <p className="mt-2 text-[11px] text-fg-3">
                  Attribution bucket — not shown on the Team Roster.
                </p>
              )}
            </form>
          );
        })}
      </div>

      <div className="mt-6 rounded-2 border-2 border-dashed border-paper-edge p-3">
        <p className="bt-eyebrow">Add Salesperson</p>
        <p className="mt-1 text-xs text-fg-2">
          Adds them to the Sales dashboard <em>and</em> the Arborist Hub Team
          Roster.
        </p>
        <form
          action={addSalesperson}
          className="mt-3 flex flex-wrap items-start gap-3"
        >
          <Field label="First Name">
            <TextInput name="name" required placeholder="e.g. Maria" className="w-32" />
          </Field>
          <Field label="Last Initial">
            <TextInput
              name="last_initial"
              maxLength={3}
              placeholder="e.g. K"
              className="w-16"
            />
          </Field>
          <Field label="Title">
            <TextInput name="title" defaultValue="Sales Arborist" className="w-40" />
          </Field>
          <Field label="ISA #">
            <TextInput name="isa_number" placeholder="optional" className="w-32" />
          </Field>
          <Field label="Order">
            <input
              type="number"
              name="display_order"
              defaultValue={
                (salespeople[salespeople.length - 1]?.display_order ?? 100) + 10
              }
              className={`${inputCls} w-16 text-right`}
            />
          </Field>
          <label className="mt-5 flex items-center gap-1.5">
            <input type="checkbox" name="certified" className="h-4 w-4" />
            <span className="text-xs text-fg-2">Certified</span>
          </label>
          <button type="submit" className="bt-btn bt-btn-primary mt-5">
            Add
          </button>
        </form>
      </div>
    </SectionCard>
  );
}

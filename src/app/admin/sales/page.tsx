import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { fmtUsd, monthLabel } from '@/lib/format';
import { MonthPicker } from '@/components/MonthPicker';
import { SectionCard, FlashBanner } from '@/components/admin-shared';
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
        .select('id, name, display_order, is_active')
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
    <main className="mx-auto max-w-5xl px-6 py-10">
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
      <form action={saveAnnualGoal} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
      <form action={saveMonthlyGoals} className="space-y-5">
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
      <form action={saveHistoricals} className="space-y-4">
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

function RosterSection({ salespeople }: { salespeople: Salesperson[] }) {
  return (
    <SectionCard
      eyebrow="4 — Roster"
      title="Salespeople"
      description="Edit names, change display order on the dashboard, or hide ex-employees. Salespeople are never deleted - flipping 'Active' off just hides them from new entries while keeping their history intact."
    >
      <div className="space-y-2">
        {salespeople.map((sp) => (
          <form
            key={sp.id}
            action={updateSalesperson}
            className="flex flex-col gap-2 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 sm:flex-row sm:items-center"
          >
            <input type="hidden" name="id" value={sp.id} />
            <label className="flex flex-1 items-center gap-2">
              <span className="bt-eyebrow w-16">Name</span>
              <input
                type="text"
                name="name"
                defaultValue={sp.name}
                className="flex-1 rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline focus:border-orange focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="bt-eyebrow">Order</span>
              <input
                type="number"
                name="display_order"
                defaultValue={sp.display_order}
                className="w-20 rounded-1 border border-paper-edge bg-bone px-2 py-1 font-headline text-right focus:border-orange focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={sp.is_active}
                className="h-4 w-4"
              />
              <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Active
              </span>
            </label>
            <button type="submit" className="bt-btn bt-btn-ghost !px-4 !py-1.5 text-xs">
              Save
            </button>
          </form>
        ))}
      </div>

      <div className="mt-6 rounded-2 border-2 border-dashed border-paper-edge p-3">
        <p className="bt-eyebrow">Add Salesperson</p>
        <form
          action={addSalesperson}
          className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <label className="flex-1">
            <span className="text-xs text-fg-2">Name</span>
            <input
              type="text"
              name="name"
              required
              placeholder="e.g. Maria"
              className="mt-1 w-full rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline focus:border-orange focus:outline-none"
            />
          </label>
          <label>
            <span className="text-xs text-fg-2">Display Order</span>
            <input
              type="number"
              name="display_order"
              defaultValue={
                (salespeople[salespeople.length - 1]?.display_order ?? 100) + 10
              }
              className="mt-1 w-24 rounded-1 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-right focus:border-orange focus:outline-none"
            />
          </label>
          <button type="submit" className="bt-btn bt-btn-primary">
            Add
          </button>
        </form>
      </div>
    </SectionCard>
  );
}

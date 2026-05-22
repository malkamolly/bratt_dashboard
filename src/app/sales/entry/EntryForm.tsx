'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveSalesEntries, deleteSalesEntry, type SaveResult } from './actions';
import type { Salesperson, CrewMember } from '@/types';
import type { AddonAttribution } from '@/lib/sales-data';

type Props = {
  date: string; // YYYY-MM-DD
  salespeople: Salesperson[];
  initialAmounts: Record<string, number>;
  crewMembers: CrewMember[];
  initialAddonAttributions: AddonAttribution[];
  /** salesperson_id of the row named "Add-Ons" (if present). When set, the
   *  Add-Ons row in the main table is rendered read-only and its total is
   *  driven by the attribution editor below. */
  addonsSalespersonId: string | null;
};

type AddonRow = {
  /** Stable client-side key. Mirrors the DB id for existing rows, or a
   *  generated string for new ones. The save action treats it as opaque. */
  key: string;
  crewMemberId: string;
  amount: string;
  note: string;
};

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Saving…' : 'Save Day'}
    </button>
  );
}

function parseMoney(raw: string): number {
  const n = Number(String(raw).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function EntryForm({
  date,
  salespeople,
  initialAmounts,
  crewMembers,
  initialAddonAttributions,
  addonsSalespersonId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveSalesEntries,
    undefined,
  );

  // Per-salesperson amount inputs. Add-Ons (if present) is excluded —
  // its total comes from the attribution editor below.
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const sp of salespeople) {
      if (sp.id === addonsSalespersonId) continue;
      const v = initialAmounts[sp.id];
      m[sp.id] = v != null && v !== 0 ? String(v) : '';
    }
    return m;
  });

  // Counter used to mint unique keys for new attribution rows.
  const [nextRowId, setNextRowId] = useState(1);
  const [addonRows, setAddonRows] = useState<AddonRow[]>(() =>
    initialAddonAttributions.map((a) => ({
      key: a.id,
      crewMemberId: a.crew_member_id,
      amount: String(a.amount),
      note: a.note ?? '',
    })),
  );

  const addonTotal = useMemo(
    () => addonRows.reduce((sum, r) => sum + parseMoney(r.amount), 0),
    [addonRows],
  );

  const total = useMemo(() => {
    const base = Object.values(amounts).reduce(
      (sum, raw) => sum + parseMoney(raw),
      0,
    );
    return base + addonTotal;
  }, [amounts, addonTotal]);

  const dirty = useMemo(() => {
    for (const sp of salespeople) {
      if (sp.id === addonsSalespersonId) continue;
      const initial = initialAmounts[sp.id] ?? 0;
      const current = parseMoney(amounts[sp.id] ?? '');
      if (Math.round(initial * 100) !== Math.round(current * 100)) return true;
    }
    // Compare addon rows by (crew_member_id, amount, note) so re-ordering
    // alone doesn't count as a change.
    const norm = (rows: { crewMemberId: string; amount: string | number; note: string | null }[]) =>
      rows
        .map((r) => ({
          c: r.crewMemberId,
          a: Math.round(parseMoney(String(r.amount)) * 100),
          n: (r.note ?? '').trim(),
        }))
        .sort((a, b) => (a.c + a.a + a.n).localeCompare(b.c + b.a + b.n));
    const before = JSON.stringify(
      norm(
        initialAddonAttributions.map((a) => ({
          crewMemberId: a.crew_member_id,
          amount: a.amount,
          note: a.note,
        })),
      ),
    );
    const after = JSON.stringify(norm(addonRows));
    if (before !== after) return true;
    return false;
  }, [
    amounts,
    addonRows,
    salespeople,
    initialAmounts,
    initialAddonAttributions,
    addonsSalespersonId,
  ]);

  const justSaved = searchParams.get('saved') === '1';
  const justDeleted = searchParams.get('deleted') === '1';

  function changeDate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    params.delete('saved');
    params.delete('deleted');
    router.push(`/sales/entry?${params.toString()}`);
  }

  function addAddonRow() {
    const key = `new-${nextRowId}`;
    setNextRowId((n) => n + 1);
    setAddonRows((rows) => [
      ...rows,
      { key, crewMemberId: '', amount: '', note: '' },
    ]);
  }

  function updateAddonRow(key: string, patch: Partial<AddonRow>) {
    setAddonRows((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function removeAddonRow(key: string) {
    setAddonRows((rows) => rows.filter((r) => r.key !== key));
  }

  const totalCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(total);
  const addonTotalCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(addonTotal);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="entry_date" value={date} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex flex-col gap-1">
          <span className="bt-eyebrow">Entry Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>
        <p className="text-sm text-fg-2 sm:max-w-md">
          Need to fix a past day? Just change the date — existing numbers pre-fill
          so you can overwrite them. Use the <strong>×</strong> button to remove
          an entry entirely.
        </p>
      </div>

      {justSaved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Saved. Numbers will refresh on the dashboard.
        </div>
      )}
      {justDeleted && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Entry deleted.
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      <div className="bt-card !p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-paper-edge/40">
            <tr>
              <th className="px-5 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Salesperson
              </th>
              <th className="px-5 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
                Amount ($)
              </th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {salespeople.map((sp, idx) => {
              const isAddons = sp.id === addonsSalespersonId;
              const hasExistingEntry = initialAmounts[sp.id] != null;
              return (
                <tr
                  key={sp.id}
                  className={idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'}
                >
                  <td className="px-5 py-2 font-headline text-base font-bold text-ink">
                    {sp.name}
                    {isAddons && (
                      <span className="ml-2 text-xs font-normal text-fg-3">
                        (edit below)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {isAddons ? (
                      <span className="inline-block w-40 rounded-2 border-2 border-dashed border-paper-edge bg-paper/40 px-3 py-2 text-right font-headline text-base text-fg-2">
                        {addonTotalCurrency}
                      </span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`amount__${sp.id}`}
                        value={amounts[sp.id] ?? ''}
                        onChange={(e) =>
                          setAmounts((m) => ({ ...m, [sp.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-40 rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                      />
                    )}
                  </td>
                  <td className="w-12 px-2 py-2 text-center">
                    {!isAddons && hasExistingEntry ? (
                      <button
                        type="submit"
                        name="delete_salesperson_id"
                        value={sp.id}
                        formAction={deleteSalesEntry}
                        onClick={(e) => {
                          if (
                            !window.confirm(
                              `Delete ${sp.name}'s entry for ${date}? This can't be undone.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                        title={`Delete ${sp.name}'s entry for this day`}
                        aria-label={`Delete ${sp.name}'s entry`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper-edge text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
                      >
                        ×
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-edge bg-paper-edge/30">
              <td className="px-5 py-3 font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
                Day Total
              </td>
              <td className="px-5 py-3 text-right font-headline text-xl font-black text-ink">
                {totalCurrency}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {addonsSalespersonId && (
        <AddonsSection
          rows={addonRows}
          crewMembers={crewMembers}
          total={addonTotalCurrency}
          onAdd={addAddonRow}
          onUpdate={updateAddonRow}
          onRemove={removeAddonRow}
        />
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
        <a
          href="/sales"
          className="bt-btn bt-btn-ghost w-full justify-center sm:w-auto"
        >
          Back to Dashboard
        </a>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}

function AddonsSection({
  rows,
  crewMembers,
  total,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rows: AddonRow[];
  crewMembers: CrewMember[];
  total: string;
  onAdd: () => void;
  onUpdate: (key: string, patch: Partial<AddonRow>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="bt-card !p-0 overflow-hidden">
      <div className="flex flex-col gap-1 border-b-2 border-paper-edge bg-paper-edge/40 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
            Add-Ons — Attribute to crew
          </p>
          <p className="mt-1 text-sm text-fg-2">
            One row per add-on sale. Pick the field crew member who booked it
            and the dollar amount. You can add as many rows as you need.
          </p>
        </div>
        <p className="whitespace-nowrap font-headline text-base font-black text-ink">
          Subtotal: {total}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-fg-3">
          No add-on attributions yet for this day.
        </div>
      ) : (
        <ul className="divide-y divide-paper-edge/50">
          {rows.map((r) => (
            <li
              key={r.key}
              className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[1fr_140px_1fr_auto] sm:items-center sm:gap-3"
            >
              <input type="hidden" name={`addon_key__${r.key}`} value={r.key} />
              <label className="flex flex-col gap-1 sm:gap-0">
                <span className="bt-eyebrow sm:hidden">Crew member</span>
                <select
                  name={`addon_crew_member_id__${r.key}`}
                  value={r.crewMemberId}
                  onChange={(e) =>
                    onUpdate(r.key, { crewMemberId: e.target.value })
                  }
                  className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
                  required
                >
                  <option value="">— select crew member —</option>
                  {crewMembers.map((cm) => (
                    <option key={cm.id} value={cm.id}>
                      {cm.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:gap-0">
                <span className="bt-eyebrow sm:hidden">Amount ($)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name={`addon_amount__${r.key}`}
                  value={r.amount}
                  onChange={(e) => onUpdate(r.key, { amount: e.target.value })}
                  placeholder="0"
                  className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 sm:gap-0">
                <span className="bt-eyebrow sm:hidden">Note (optional)</span>
                <input
                  type="text"
                  name={`addon_note__${r.key}`}
                  value={r.note}
                  onChange={(e) => onUpdate(r.key, { note: e.target.value })}
                  placeholder="Note (optional)"
                  className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-sm focus:border-orange focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => onRemove(r.key)}
                title="Remove this attribution"
                aria-label="Remove this attribution"
                className="inline-flex h-9 w-9 items-center justify-center justify-self-end rounded-full border-2 border-paper-edge text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t-2 border-paper-edge bg-paper-edge/30 px-5 py-3">
        <button
          type="button"
          onClick={onAdd}
          className="bt-btn bt-btn-ghost"
        >
          + Add another
        </button>
      </div>
    </div>
  );
}

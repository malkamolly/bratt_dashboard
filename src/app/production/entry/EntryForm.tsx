'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveProductionEntries, type SaveResult } from './actions';
import type { Crew, CrewMember } from '@/types';

type Props = {
  date: string;
  crews: Crew[];
  members: CrewMember[];
  initialMemberEntries: Record<
    string,
    { crew_id: string; jobs: number; revenue: number }
  >;
  initialCrewEntries: Record<string, { jobs: number; revenue: number }>;
};

// ----------------------------------------------------------------------------
// Layout: uniform 3-column grid on md+ screens. Each cell is the same width
// regardless of how many crews are on a given row. `null` cells render as
// empty placeholders so the next row starts cleanly on the left. Mobile
// collapses to one card per row.
// ----------------------------------------------------------------------------
// Each row is a list of crew names. Rows shorter than 3 get centered (empty
// cells flank the cards left and right) so card widths stay uniform.
const ROW_LAYOUT: string[][] = [
  ['PHC', 'Stump Grinding', 'Clam'],
  ['Black', 'Red'],
  ['Blue I', 'Blue II', 'Blue III'],
  ['Green 1', 'Green 2'],
  ['Gray', 'Pink'],
  ['Other', 'Unassigned'],
];

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save Day'}
    </button>
  );
}

const fmtCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const parseRevenue = (s: string) => {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const parseJobs = (s: string) => {
  const n = Number(String(s).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function EntryForm({
  date,
  crews,
  members,
  initialMemberEntries,
  initialCrewEntries,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveProductionEntries,
    undefined,
  );

  const [memberJobs, setMemberJobs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const mb of members) {
      const e = initialMemberEntries[mb.id];
      m[mb.id] = e && e.jobs ? String(e.jobs) : '';
    }
    return m;
  });
  const [memberRevenue, setMemberRevenue] = useState<Record<string, string>>(
    () => {
      const m: Record<string, string> = {};
      for (const mb of members) {
        const e = initialMemberEntries[mb.id];
        m[mb.id] = e && e.revenue ? String(e.revenue) : '';
      }
      return m;
    },
  );
  const [memberAssignment, setMemberAssignment] = useState<
    Record<string, string>
  >(() => {
    const m: Record<string, string> = {};
    for (const mb of members) {
      const e = initialMemberEntries[mb.id];
      m[mb.id] = e?.crew_id ?? mb.home_crew_id ?? '';
    }
    return m;
  });
  const [crewJobs, setCrewJobs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of crews) {
      const e = initialCrewEntries[c.id];
      m[c.id] = e && e.jobs ? String(e.jobs) : '';
    }
    return m;
  });
  const [crewRevenue, setCrewRevenue] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of crews) {
      const e = initialCrewEntries[c.id];
      m[c.id] = e && e.revenue ? String(e.revenue) : '';
    }
    return m;
  });

  const memberByCrew = useMemo(() => {
    const map = new Map<string, CrewMember[]>();
    for (const mb of members) {
      const cid = memberAssignment[mb.id] ?? mb.home_crew_id ?? '';
      if (!cid) continue;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(mb);
    }
    return map;
  }, [members, memberAssignment]);

  const crewTotals = useMemo(() => {
    const totals = new Map<string, { jobs: number; revenue: number }>();
    for (const mb of members) {
      const cid = memberAssignment[mb.id] ?? mb.home_crew_id ?? '';
      if (!cid) continue;
      const cur = totals.get(cid) ?? { jobs: 0, revenue: 0 };
      totals.set(cid, {
        jobs: cur.jobs + parseJobs(memberJobs[mb.id] ?? ''),
        revenue: cur.revenue + parseRevenue(memberRevenue[mb.id] ?? ''),
      });
    }
    // Crews without members fall back to direct crew-level input
    for (const c of crews) {
      if (memberByCrew.has(c.id)) continue;
      const j = parseJobs(crewJobs[c.id] ?? '');
      const r = parseRevenue(crewRevenue[c.id] ?? '');
      if (j === 0 && r === 0) continue;
      totals.set(c.id, { jobs: j, revenue: r });
    }
    return totals;
  }, [
    members,
    memberAssignment,
    memberJobs,
    memberRevenue,
    crews,
    memberByCrew,
    crewJobs,
    crewRevenue,
  ]);

  const dayTotal = useMemo(() => {
    let jobs = 0;
    let rev = 0;
    for (const v of crewTotals.values()) {
      jobs += v.jobs;
      rev += v.revenue;
    }
    return { jobs, revenue: rev };
  }, [crewTotals]);

  const dirty = useMemo(() => {
    for (const mb of members) {
      const initial = initialMemberEntries[mb.id];
      const initJobs = initial?.jobs ?? 0;
      const initRev = initial?.revenue ?? 0;
      const initCrew = initial?.crew_id ?? mb.home_crew_id ?? '';
      const curJobs = parseJobs(memberJobs[mb.id] ?? '');
      const curRev = parseRevenue(memberRevenue[mb.id] ?? '');
      const curCrew = memberAssignment[mb.id] ?? mb.home_crew_id ?? '';
      if (curJobs !== initJobs) return true;
      if (Math.round(curRev * 100) !== Math.round(initRev * 100)) return true;
      if (
        curCrew !== initCrew &&
        (curJobs > 0 || curRev > 0 || initJobs > 0 || initRev > 0)
      )
        return true;
    }
    for (const c of crews) {
      if (memberByCrew.has(c.id)) continue;
      const initial = initialCrewEntries[c.id];
      const initJobs = initial?.jobs ?? 0;
      const initRev = initial?.revenue ?? 0;
      const curJobs = parseJobs(crewJobs[c.id] ?? '');
      const curRev = parseRevenue(crewRevenue[c.id] ?? '');
      if (curJobs !== initJobs) return true;
      if (Math.round(curRev * 100) !== Math.round(initRev * 100)) return true;
    }
    return false;
  }, [
    members,
    initialMemberEntries,
    memberJobs,
    memberRevenue,
    memberAssignment,
    crews,
    memberByCrew,
    initialCrewEntries,
    crewJobs,
    crewRevenue,
  ]);

  const justSaved = searchParams.get('saved') === '1';

  function changeDate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    params.delete('saved');
    router.push(`/production/entry?${params.toString()}`);
  }

  // Resolve crew names → crews. Any active crews not named in the layout
  // get appended as a final row so they're never missing from the form.
  const crewByName = new Map(crews.map((c) => [c.name, c]));
  const namedInLayout = new Set(ROW_LAYOUT.flat());
  const extraCrews = crews.filter((c) => !namedInLayout.has(c.name));

  const renderedRows: Crew[][] = ROW_LAYOUT.map((names) =>
    names.map((n) => crewByName.get(n)).filter((c): c is Crew => !!c),
  ).filter((row) => row.length > 0);
  if (extraCrews.length > 0) {
    renderedRows.push(extraCrews);
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="entry_date" value={date} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-fg-2 sm:max-w-xl">
          Type each crew member&apos;s numbers below. Crew totals update live as
          you type. Use a member&apos;s <strong>Crew ▾</strong> dropdown to move
          them to a different crew just for this day.
        </p>
        <label className="flex flex-col gap-1 sm:items-end">
          <span className="bt-eyebrow">Entry Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => changeDate(e.target.value)}
            className="rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-base focus:border-orange focus:outline-none"
          />
        </label>
      </div>

      {justSaved && !state && (
        <div className="rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          Saved. Numbers will refresh on the dashboard.
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      <div className="space-y-4">
        {renderedRows.map((row, ri) => {
          // Each row is its own 6-column grid so short rows can be centered
          // with empty spacer cells. A card always spans 2 of 6 columns so it
          // has the same visual width regardless of how many cards are in the
          // row. 3 cards = 2+2+2; 2 cards = 1+2+2+1; 1 card = 2+2+2.
          const sideSpan =
            row.length === 3 ? 0 : row.length === 2 ? 1 : row.length === 1 ? 2 : 0;
          return (
            <div key={ri} className="grid grid-cols-1 gap-4 md:grid-cols-6">
              {sideSpan > 0 && (
                <div
                  className={
                    sideSpan === 1
                      ? 'hidden md:block md:col-span-1'
                      : 'hidden md:block md:col-span-2'
                  }
                />
              )}
              {row.map((crew) => {
                const members = memberByCrew.get(crew.id) ?? [];
                const totals =
                  crewTotals.get(crew.id) ?? { jobs: 0, revenue: 0 };
                return (
                  <div key={crew.id} className="md:col-span-2">
                    <CrewCard
                      crew={crew}
                      members={members}
                      totals={totals}
                      allCrewsForReassignment={crews}
                      memberJobs={memberJobs}
                      setMemberJobs={setMemberJobs}
                      memberRevenue={memberRevenue}
                      setMemberRevenue={setMemberRevenue}
                      memberAssignment={memberAssignment}
                      setMemberAssignment={setMemberAssignment}
                      crewJobs={crewJobs}
                      setCrewJobs={setCrewJobs}
                      crewRevenue={crewRevenue}
                      setCrewRevenue={setCrewRevenue}
                    />
                  </div>
                );
              })}
              {sideSpan > 0 && (
                <div
                  className={
                    sideSpan === 1
                      ? 'hidden md:block md:col-span-1'
                      : 'hidden md:block md:col-span-2'
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="bt-card flex items-baseline justify-between !py-4">
        <span className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
          Day Total
        </span>
        <div className="text-right">
          <p className="font-headline text-2xl font-black text-ink">
            {fmtCurrency.format(dayTotal.revenue)}
          </p>
          <p className="text-xs text-fg-3">
            {dayTotal.jobs} {dayTotal.jobs === 1 ? 'job' : 'jobs'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <a href="/production" className="bt-btn bt-btn-ghost">
          Back to Dashboard
        </a>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------------
// CrewCard - one crew's header with rollup totals and either member rows
// or a single direct crew-level row (when no members are configured).
// ----------------------------------------------------------------------------
function CrewCard({
  crew,
  members,
  totals,
  allCrewsForReassignment,
  memberJobs,
  setMemberJobs,
  memberRevenue,
  setMemberRevenue,
  memberAssignment,
  setMemberAssignment,
  crewJobs,
  setCrewJobs,
  crewRevenue,
  setCrewRevenue,
}: {
  crew: Crew;
  members: CrewMember[];
  totals: { jobs: number; revenue: number };
  allCrewsForReassignment: Crew[];
  memberJobs: Record<string, string>;
  setMemberJobs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  memberRevenue: Record<string, string>;
  setMemberRevenue: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  memberAssignment: Record<string, string>;
  setMemberAssignment: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  crewJobs: Record<string, string>;
  setCrewJobs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  crewRevenue: Record<string, string>;
  setCrewRevenue: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const hasMembers = members.length > 0;
  return (
    <div className="bt-card !p-0 overflow-hidden">
      <div className="flex items-center justify-between bg-bark px-3 py-2 text-cream">
        <h3 className="font-headline text-xs font-extrabold uppercase tracking-ribbon">
          {crew.name}
        </h3>
        <div className="flex items-baseline gap-3 text-right">
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-ribbon text-lime">
              Jobs
            </p>
            <p className="font-headline text-base font-black leading-none">
              {totals.jobs}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-extrabold uppercase tracking-ribbon text-lime">
              Revenue
            </p>
            <p className="font-headline text-base font-black leading-none">
              {fmtCurrency.format(totals.revenue)}
            </p>
          </div>
        </div>
      </div>

      {hasMembers ? (
        <div>
          {members.map((mb, idx) => (
            <div
              key={mb.id}
              className={`flex flex-wrap items-center gap-1.5 px-2 py-1.5 ${
                idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'
              }`}
            >
              <input
                type="hidden"
                name={`crew__member_${mb.id}`}
                value={memberAssignment[mb.id] ?? ''}
              />
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="truncate font-headline text-xs font-bold text-ink">
                  {mb.name}
                </span>
                {mb.is_foreman && (
                  <span
                    title="Foreman"
                    className="shrink-0 rounded-full bg-orange/20 px-1 py-0.5 font-headline text-[8px] font-extrabold uppercase tracking-ribbon text-orange-press"
                  >
                    F
                  </span>
                )}
              </div>
              <input
                type="text"
                inputMode="numeric"
                name={`jobs__member_${mb.id}`}
                value={memberJobs[mb.id] ?? ''}
                onChange={(e) =>
                  setMemberJobs((m) => ({ ...m, [mb.id]: e.target.value }))
                }
                placeholder="0"
                title="Jobs"
                className="w-9 rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
              />
              <div className="flex items-center">
                <span className="pr-0.5 text-[10px] font-bold text-fg-3">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name={`revenue__member_${mb.id}`}
                  value={memberRevenue[mb.id] ?? ''}
                  onChange={(e) =>
                    setMemberRevenue((m) => ({ ...m, [mb.id]: e.target.value }))
                  }
                  placeholder="0"
                  title="Revenue"
                  className="w-14 rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
                />
              </div>
              <select
                value={memberAssignment[mb.id] ?? ''}
                onChange={(e) =>
                  setMemberAssignment((m) => ({
                    ...m,
                    [mb.id]: e.target.value,
                  }))
                }
                title="Move to a different crew for this day"
                className="w-36 shrink-0 truncate rounded-1 border border-paper-edge bg-white py-1 pl-1 pr-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-ink focus:border-orange focus:outline-none"
              >
                {allCrewsForReassignment.map((cr) => (
                  <option key={cr.id} value={cr.id}>
                    {cr.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="flex-1 text-[11px] italic text-fg-3">
            No members. Enter crew totals directly.
          </span>
          <input
            type="text"
            inputMode="numeric"
            name={`jobs__crew_${crew.id}`}
            value={crewJobs[crew.id] ?? ''}
            onChange={(e) =>
              setCrewJobs((m) => ({ ...m, [crew.id]: e.target.value }))
            }
            placeholder="Jobs"
            title="Jobs"
            className="w-12 rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
          />
          <div className="flex items-center">
            <span className="pr-0.5 text-[10px] font-bold text-fg-3">$</span>
            <input
              type="text"
              inputMode="decimal"
              name={`revenue__crew_${crew.id}`}
              value={crewRevenue[crew.id] ?? ''}
              onChange={(e) =>
                setCrewRevenue((m) => ({ ...m, [crew.id]: e.target.value }))
              }
              placeholder="Revenue"
              title="Revenue"
              className="w-20 rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

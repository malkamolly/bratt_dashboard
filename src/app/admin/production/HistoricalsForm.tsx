'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveProductionMemberHistoricals } from '../actions';
import type { Crew, CrewMember } from '@/types';

type SaveResult = { ok: false; error: string } | undefined;

type Props = {
  year: number;
  month: number;
  crews: Crew[];
  members: CrewMember[];
  initialMemberRows: Record<
    string,
    { crew_id: string; jobs: number; revenue: number }
  >;
  initialCrewRows: Record<string, { jobs: number; revenue: number }>;
};

// Same row layout as the daily entry form so the admin's monthly view feels
// identical to what they see when entering days.
const ROW_LAYOUT: string[][] = [
  ['PHC', 'Stump Grinding', 'Clam'],
  ['Black', 'Red'],
  ['Blue I', 'Blue II', 'Blue III'],
  ['Green 1', 'Green 2'],
  ['Gray', 'Pink'],
  ['Other', 'Unassigned'],
];

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

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="bt-btn bt-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save Historicals'}
    </button>
  );
}

export function HistoricalsForm({
  year,
  month,
  crews,
  members,
  initialMemberRows,
  initialCrewRows,
}: Props) {
  const [state, formAction] = useActionState<SaveResult, FormData>(
    saveProductionMemberHistoricals,
    undefined,
  );

  const [memberJobs, setMemberJobs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const mb of members) {
      const e = initialMemberRows[mb.id];
      m[mb.id] = e && e.jobs ? String(e.jobs) : '';
    }
    return m;
  });
  const [memberRevenue, setMemberRevenue] = useState<Record<string, string>>(
    () => {
      const m: Record<string, string> = {};
      for (const mb of members) {
        const e = initialMemberRows[mb.id];
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
      const e = initialMemberRows[mb.id];
      m[mb.id] = e?.crew_id ?? mb.home_crew_id ?? '';
    }
    return m;
  });
  const [crewJobs, setCrewJobs] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of crews) {
      const e = initialCrewRows[c.id];
      m[c.id] = e && e.jobs ? String(e.jobs) : '';
    }
    return m;
  });
  const [crewRevenue, setCrewRevenue] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of crews) {
      const e = initialCrewRows[c.id];
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

  const monthTotal = useMemo(() => {
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
      const initial = initialMemberRows[mb.id];
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
      const initial = initialCrewRows[c.id];
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
    initialMemberRows,
    memberJobs,
    memberRevenue,
    memberAssignment,
    crews,
    memberByCrew,
    initialCrewRows,
    crewJobs,
    crewRevenue,
  ]);

  // Match crews to the named layout; append any extras as a final row so no
  // active crew is missing from the form.
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
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      {state?.ok === false && (
        <div className="rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {state.error}
        </div>
      )}

      <div className="space-y-4">
        {renderedRows.map((row, ri) => {
          const sideSpan =
            row.length === 3 ? 0 : row.length === 2 ? 1 : row.length === 1 ? 2 : 0;
          return (
            <div key={ri} className="grid grid-cols-1 items-start gap-4 md:grid-cols-6">
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
                const crewMembers = memberByCrew.get(crew.id) ?? [];
                const totals =
                  crewTotals.get(crew.id) ?? { jobs: 0, revenue: 0 };
                return (
                  <div key={crew.id} className="md:col-span-2">
                    <CrewCard
                      crew={crew}
                      members={crewMembers}
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
          Month Total
        </span>
        <div className="text-right">
          <p className="font-headline text-2xl font-black text-ink">
            {fmtCurrency.format(monthTotal.revenue)}
          </p>
          <p className="text-xs text-fg-3">
            {monthTotal.jobs} {monthTotal.jobs === 1 ? 'job' : 'jobs'}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}

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
              className={`grid grid-cols-[minmax(0,1fr)_2.25rem_5.5rem_5.5rem] items-center gap-1.5 px-2 py-1.5 ${
                idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'
              } ${!mb.is_active ? 'opacity-60' : ''}`}
            >
              <input
                type="hidden"
                name={`crew__member_${mb.id}`}
                value={memberAssignment[mb.id] ?? ''}
              />
              <div className="flex min-w-0 items-center gap-1">
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
                {!mb.is_active && (
                  <span
                    title="Inactive member with historical data"
                    className="shrink-0 rounded-full bg-fg-3/20 px-1 py-0.5 font-headline text-[8px] font-extrabold uppercase tracking-ribbon text-fg-2"
                  >
                    Inactive
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
                className="w-full rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
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
                  className="min-w-0 flex-1 rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
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
                title="Crew this member contributed to for this month"
                className="w-full min-w-0 truncate rounded-1 border border-paper-edge bg-white py-1 pl-1 pr-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-ink focus:border-orange focus:outline-none"
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
              className="w-24 rounded-1 border border-paper-edge bg-white px-1.5 py-1 text-right font-headline text-sm focus:border-orange focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

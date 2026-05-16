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

  // Member values and their per-day crew assignment.
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

  // Direct crew-level entries (only used for crews without members).
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

  const crewsWithoutMembers = useMemo(() => {
    return crews.filter((c) => !memberByCrew.has(c.id));
  }, [crews, memberByCrew]);

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

  // Live rollups
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
    // Add crew-level direct inputs for crews without members
    for (const c of crewsWithoutMembers) {
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
    crewsWithoutMembers,
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

  // Dirty flag
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
      if (curCrew !== initCrew && (curJobs > 0 || curRev > 0 || initJobs > 0 || initRev > 0)) return true;
    }
    for (const c of crewsWithoutMembers) {
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
    crewsWithoutMembers,
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

  // Build crew sections in display_order. Production first, then PHC.
  const productionCrews = crews.filter((c) => c.kind === 'production');
  const phcCrews = crews.filter((c) => c.kind === 'phc');

  return (
    <form action={formAction} className="space-y-8">
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
          Type each crew member&apos;s numbers below. Crew totals update live as
          you type. Use a member&apos;s <strong>Crew ▾</strong> dropdown to move
          them to a different crew just for this day.
        </p>
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

      <CrewSectionGroup
        title="Production Crews"
        crews={productionCrews}
        allCrewsForReassignment={crews}
        memberByCrew={memberByCrew}
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
        crewTotals={crewTotals}
      />

      {phcCrews.length > 0 && (
        <CrewSectionGroup
          title="Plant Healthcare"
          crews={phcCrews}
          allCrewsForReassignment={crews}
          memberByCrew={memberByCrew}
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
          crewTotals={crewTotals}
        />
      )}

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
// One group (Production or PHC) - renders a card per crew with its members.
// ----------------------------------------------------------------------------
function CrewSectionGroup({
  title,
  crews,
  allCrewsForReassignment,
  memberByCrew,
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
  crewTotals,
}: {
  title: string;
  crews: Crew[];
  allCrewsForReassignment: Crew[];
  memberByCrew: Map<string, CrewMember[]>;
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
  crewTotals: Map<string, { jobs: number; revenue: number }>;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-2">
        {title}
      </h2>
      {crews.map((c) => {
        const members = memberByCrew.get(c.id) ?? [];
        const totals = crewTotals.get(c.id) ?? { jobs: 0, revenue: 0 };
        const hasMembers = members.length > 0;
        return (
          <div key={c.id} className="bt-card !p-0 overflow-hidden">
            {/* Crew header with rollup totals */}
            <div className="flex items-center justify-between bg-bark px-5 py-3 text-cream">
              <h3 className="font-headline text-base font-extrabold uppercase tracking-ribbon">
                {c.name}
              </h3>
              <div className="flex items-baseline gap-4 text-right">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-ribbon text-lime">
                    Jobs
                  </p>
                  <p className="font-headline text-lg font-black">{totals.jobs}</p>
                </div>
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-ribbon text-lime">
                    Revenue
                  </p>
                  <p className="font-headline text-lg font-black">
                    {fmtCurrency.format(totals.revenue)}
                  </p>
                </div>
              </div>
            </div>

            {/* Members or direct crew-level entry */}
            {hasMembers ? (
              <div>
                {members.map((mb, idx) => (
                  <div
                    key={mb.id}
                    className={`flex flex-wrap items-center gap-2 px-5 py-2 sm:flex-nowrap ${
                      idx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'
                    }`}
                  >
                    <input type="hidden" name={`crew__member_${mb.id}`} value={memberAssignment[mb.id] ?? ''} />
                    <div className="flex flex-1 items-center gap-2">
                      <span className="font-headline text-sm font-bold text-ink">
                        {mb.name}
                      </span>
                      {mb.is_foreman && (
                        <span className="rounded-full bg-orange/15 px-1.5 py-0.5 font-headline text-[9px] font-extrabold uppercase tracking-ribbon text-orange-press">
                          Foreman
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase text-fg-3">
                        Jobs
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        name={`jobs__member_${mb.id}`}
                        value={memberJobs[mb.id] ?? ''}
                        onChange={(e) =>
                          setMemberJobs((m) => ({ ...m, [mb.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-16 rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 text-right font-headline focus:border-orange focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase text-fg-3">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        name={`revenue__member_${mb.id}`}
                        value={memberRevenue[mb.id] ?? ''}
                        onChange={(e) =>
                          setMemberRevenue((m) => ({ ...m, [mb.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-28 rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 text-right font-headline focus:border-orange focus:outline-none"
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
                      className="rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 font-headline text-xs font-extrabold uppercase tracking-ribbon text-ink focus:border-orange focus:outline-none"
                      title="Move to a different crew for this day"
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
              // Crew-level direct entry (no members configured)
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-xs italic text-fg-3 sm:flex-1">
                  No crew members configured. Enter crew totals directly.
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-fg-3">
                    Jobs
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    name={`jobs__crew_${c.id}`}
                    value={crewJobs[c.id] ?? ''}
                    onChange={(e) =>
                      setCrewJobs((m) => ({ ...m, [c.id]: e.target.value }))
                    }
                    placeholder="0"
                    className="w-16 rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 text-right font-headline focus:border-orange focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-fg-3">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`revenue__crew_${c.id}`}
                    value={crewRevenue[c.id] ?? ''}
                    onChange={(e) =>
                      setCrewRevenue((m) => ({ ...m, [c.id]: e.target.value }))
                    }
                    placeholder="0"
                    className="w-28 rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 text-right font-headline focus:border-orange focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

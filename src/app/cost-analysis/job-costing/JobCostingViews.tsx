'use client';

// ============================================================================
// Job-costing visuals (client). Fed pre-computed job data — no wages here.
// ============================================================================

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import type { CostedJob } from '@/lib/job-costing';
import { fmtUsd } from '@/lib/format';

const ORANGE = '#EB4C1B';
const BARK = '#26190E';
const GRID = '#E7DFCE';

const pct0 = (n: number) => `${Math.round(n * 100)}%`;

// ---------------------------------------------------------------------------
// Labor share of revenue, one bar per job, colored single- vs multi-day
// ---------------------------------------------------------------------------
export function LaborShareChart({ jobs }: { jobs: CostedJob[] }) {
  // Sort most labor-heavy first so the standouts read top-down.
  const data = [...jobs]
    .sort((a, b) => b.laborPct - a.laborPct)
    .map((j) => ({
      label: `${fmtUsd(j.revenue)} · ${j.days}d`,
      laborPct: j.laborPct,
      multi: j.days > 1,
      inv: j.inv,
      laborCost: j.laborCost,
    }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 30 + 50)}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 70, bottom: 20, left: 10 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={pct0}
          tick={{ fontSize: 11, fill: BARK }}
          label={{ value: 'Labor as % of job revenue', position: 'bottom', offset: 6, fill: BARK, fontSize: 12 }}
        />
        <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11, fill: BARK }} />
        <Tooltip
          formatter={(v: number, _n, p) => [`${pct0(v)}  (${fmtUsd(p.payload.laborCost)} labor)`, 'Labor share']}
          labelFormatter={(l) => `Job ${l}`}
        />
        <Legend verticalAlign="top" height={26} payload={[
          { value: 'Single-day job', type: 'square', color: ORANGE },
          { value: 'Multi-day job', type: 'square', color: BARK },
        ]} />
        <Bar dataKey="laborPct" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.inv} fill={d.multi ? BARK : ORANGE} />
          ))}
          <LabelList dataKey="laborPct" position="right" formatter={pct0} style={{ fontSize: 11, fill: BARK }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// The job table — everything visible at a glance (no clicking to expand)
// ---------------------------------------------------------------------------
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function TreeLine({ t }: { t: CostedJob['treeDetails'][number] }) {
  const meta = [
    t.height != null ? `${Math.round(t.height)}′ tall` : null,
    t.crown != null && t.crown <= 100 ? `${Math.round(t.crown)}′ crown` : null,
    t.haul ? 'haul' : null,
  ].filter(Boolean);
  return (
    <div className="whitespace-nowrap">
      <span className="font-semibold text-ink">{t.dbh != null ? `${Math.round(t.dbh)}"` : '?'}</span>{' '}
      {truncate(t.species ?? 'Unknown', 26)}
      {meta.length > 0 && <span className="text-fg-3"> · {meta.join(' · ')}</span>}
    </div>
  );
}

export function JobCostTable({ jobs }: { jobs: CostedJob[] }) {
  const data = [...jobs].sort((a, b) => a.revenue - b.revenue);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-bark/20 text-left align-bottom text-fg-2">
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Job / Seller</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">What was removed</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Days</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Crew</th>
            <th className="py-2 pr-3 text-right font-extrabold uppercase tracking-wide">Revenue</th>
            <th className="py-2 pr-3 text-right font-extrabold uppercase tracking-wide">Base labor</th>
            <th className="py-2 text-right font-extrabold uppercase tracking-wide">Labor %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((j) => (
            <tr key={j.inv} className={`border-b border-bark/10 align-top ${j.days > 1 ? 'bg-lime/10' : ''}`}>
              <td className="py-3 pr-3">
                <div className="font-bold text-ink">{j.inv}</div>
                <div className="text-xs text-fg-3">{j.seller ?? '—'}</div>
              </td>
              <td className="py-3 pr-3 text-fg-2">
                {j.treeDetails.map((t, i) => (
                  <TreeLine key={i} t={t} />
                ))}
              </td>
              <td className="py-3 pr-3">
                {j.days > 1 ? (
                  <span className="font-bold text-orange">{j.days}</span>
                ) : (
                  <span className="text-fg-2">1</span>
                )}
              </td>
              <td className="py-3 pr-3 text-fg-2">
                <div className="whitespace-nowrap">
                  {j.crewSize} · {j.crewHours.toFixed(1)}h
                </div>
                <div className="max-w-[16rem] text-xs text-fg-3">
                  {j.crew.map((c) => c.name).join(', ')}
                </div>
              </td>
              <td className="py-3 pr-3 text-right font-bold text-ink">{fmtUsd(j.revenue)}</td>
              <td className="py-3 pr-3 text-right text-fg-2">{fmtUsd(j.laborCost)}</td>
              <td className={`py-3 text-right font-bold ${j.laborPct >= 0.2 ? 'text-orange' : 'text-ink'}`}>
                {pct0(j.laborPct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

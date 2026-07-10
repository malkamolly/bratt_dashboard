'use client';

// ============================================================================
// Job-costing visuals (client). Fed pre-computed job data — no wages here.
// ============================================================================

import { Fragment, useState } from 'react';
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
// The job table, click a row to reveal the crew + hours
// ---------------------------------------------------------------------------
export function JobCostTable({ jobs }: { jobs: CostedJob[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const data = [...jobs].sort((a, b) => a.revenue - b.revenue);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-bark/20 text-left text-fg-2">
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Job #</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Seller</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Days</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Crew</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Hrs</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Revenue</th>
            <th className="py-2 pr-3 font-extrabold uppercase tracking-wide">Labor</th>
            <th className="py-2 font-extrabold uppercase tracking-wide">Labor %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((j) => (
            <Fragment key={j.inv}>
              <tr
                onClick={() => setOpen((o) => (o === j.inv ? null : j.inv))}
                className={`cursor-pointer border-b border-bark/10 transition-colors hover:bg-lime/20 ${
                  open === j.inv ? 'bg-lime/30' : ''
                }`}
              >
                <td className="py-2 pr-3 font-bold text-ink">{j.inv}</td>
                <td className="py-2 pr-3 text-fg-2">{j.seller ?? '—'}</td>
                <td className="py-2 pr-3 text-fg-2">{j.days}</td>
                <td className="py-2 pr-3 text-fg-2">{j.crewSize}</td>
                <td className="py-2 pr-3 text-fg-2">{j.crewHours.toFixed(1)}</td>
                <td className="py-2 pr-3 font-bold text-ink">{fmtUsd(j.revenue)}</td>
                <td className="py-2 pr-3 text-fg-2">{fmtUsd(j.laborCost)}</td>
                <td className={`py-2 font-bold ${j.laborPct >= 0.2 ? 'text-orange' : 'text-ink'}`}>
                  {pct0(j.laborPct)}
                </td>
              </tr>
              {open === j.inv && (
                <tr className="bg-white/60">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="text-xs font-extrabold uppercase tracking-wide text-fg-2">
                      Crew on this job ({j.trees} tree{j.trees > 1 ? 's' : ''}
                      {j.sizes.length ? `, ${j.sizes.join('", ')}"` : ''})
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {j.crew.map((c, i) => (
                        <span
                          key={i}
                          className="rounded-full border-2 border-bark/20 px-3 py-1 text-xs text-ink"
                        >
                          {c.name} · {c.hours.toFixed(1)}h
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

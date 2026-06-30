'use client';

// ============================================================================
// Interactive cost-analysis sections (client).
// ============================================================================
// Everything below the hero scatter is "click a group -> see its invoices".
// Each section owns a small bit of selection state and, when a band / bar /
// card / cell is clicked, expands an invoice table beneath it. All numbers
// are still computed server-side (lib/cost-analysis.ts); this layer only
// handles the click-to-drill interaction.
// ============================================================================

import { useState } from 'react';
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
import type { BandStat, DriverCompare, HeightGrid, JobRef } from '@/lib/cost-analysis';
import { fmtUsd } from '@/lib/format';

const ORANGE = '#EB4C1B';
const BARK = '#26190E';
const DIM = '#D8C9A8';
const GRID = '#E7DFCE';

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

// ---------------------------------------------------------------------------
// Shared: the expanded invoice list for one group
// ---------------------------------------------------------------------------
function CopyInvoicesButton({ items }: { items: JobRef[] }) {
  const [copied, setCopied] = useState(false);
  const invoices = items.map((i) => i.inv).filter(Boolean).join(', ');
  async function copy() {
    try {
      await navigator.clipboard.writeText(invoices);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-full border-2 border-bark/30 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-bark-deep transition-colors hover:bg-bark hover:text-cream"
    >
      {copied ? 'Copied!' : 'Copy invoice #s'}
    </button>
  );
}

function JobTable({ title, items }: { title: string; items: JobRef[] }) {
  return (
    <div className="mt-4 rounded-card border-2 border-bark/15 bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-headline text-sm font-extrabold uppercase tracking-wide text-bark-deep">
          {title} — {items.length} {items.length === 1 ? 'job' : 'jobs'}
        </h3>
        <CopyInvoicesButton items={items} />
      </div>
      <div className="mt-3 max-h-96 overflow-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="sticky top-0 bg-white/95">
            <tr className="border-b-2 border-bark/20 text-left text-fg-2">
              <th className="py-1.5 pr-3 font-extrabold uppercase">Invoice</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Price</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Size</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Ht</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Haul</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Species</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Seller</th>
              <th className="py-1.5 font-extrabold uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((j, i) => (
              <tr key={`${j.inv}-${i}`} className="border-b border-bark/10">
                <td className="py-1.5 pr-3 font-bold text-ink">{j.inv ?? '—'}</td>
                <td className="py-1.5 pr-3 font-bold text-orange">{fmtUsd(j.price)}</td>
                <td className="py-1.5 pr-3 text-fg-2">{Math.round(j.dbh)}&quot;</td>
                <td className="py-1.5 pr-3 text-fg-2">{j.height != null ? `${Math.round(j.height)}′` : '—'}</td>
                <td className="py-1.5 pr-3 text-fg-2">{j.haul ? '✓' : '—'}</td>
                <td className="py-1.5 pr-3 text-fg-2">{j.species ?? '—'}</td>
                <td className="py-1.5 pr-3 text-fg-2">{j.seller ?? '—'}</td>
                <td className="py-1.5 text-fg-3">{fmtDate(j.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs italic text-fg-3">{children}</p>;
}

// ---------------------------------------------------------------------------
// Typical price by tree size — clickable table rows + clickable bars
// ---------------------------------------------------------------------------
export function SizeBandSection({ bands }: { bands: BandStat[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const toggle = (label: string) => setSel((s) => (s === label ? null : label));
  const selected = bands.find((b) => b.label === sel);

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                <th className="py-2 pr-4 font-extrabold uppercase tracking-wide">Trunk size</th>
                <th className="py-2 pr-4 font-extrabold uppercase tracking-wide"># trees</th>
                <th className="py-2 pr-4 font-extrabold uppercase tracking-wide">Typical</th>
                <th className="py-2 pr-4 font-extrabold uppercase tracking-wide">Average</th>
                <th className="py-2 font-extrabold uppercase tracking-wide">Normal range</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => (
                <tr
                  key={b.label}
                  onClick={() => toggle(b.label)}
                  className={`cursor-pointer border-b border-bark/10 transition-colors hover:bg-lime/20 ${
                    sel === b.label ? 'bg-lime/30' : ''
                  }`}
                >
                  <td className="py-2 pr-4 font-bold text-ink">{b.label}</td>
                  <td className="py-2 pr-4 text-fg-2">{b.count}</td>
                  <td className="py-2 pr-4 font-bold text-orange">{fmtUsd(b.median)}</td>
                  <td className="py-2 pr-4 text-fg-2">{fmtUsd(b.mean)}</td>
                  <td className="py-2 text-fg-2">
                    {fmtUsd(b.p25)} – {fmtUsd(b.p75)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint>Click any size to list its invoices below.</Hint>
        </div>
        <div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={bands} margin={{ top: 24, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: BARK }}
                label={{ value: 'Trunk size (DBH)', position: 'bottom', offset: 10, fill: BARK, fontSize: 12 }}
              />
              <YAxis tickFormatter={usd0} tick={{ fontSize: 12, fill: BARK }} width={70} />
              <Tooltip formatter={(v: number) => usd0(v)} cursor={{ fill: 'rgba(235,76,27,0.08)' }} />
              <Legend verticalAlign="top" height={26} />
              <Bar
                dataKey="median"
                name="Typical (median)"
                radius={[4, 4, 0, 0]}
                onClick={(d: { label?: string }) => d?.label && toggle(d.label)}
                className="cursor-pointer"
              >
                {bands.map((b) => (
                  <Cell key={b.label} fill={sel && sel !== b.label ? DIM : ORANGE} />
                ))}
              </Bar>
              <Bar
                dataKey="mean"
                name="Average"
                radius={[4, 4, 0, 0]}
                onClick={(d: { label?: string }) => d?.label && toggle(d.label)}
                className="cursor-pointer"
              >
                {bands.map((b) => (
                  <Cell key={b.label} fill={sel && sel !== b.label ? DIM : BARK} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {selected && <JobTable title={`${selected.label} trunk`} items={selected.items} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hauling — two clickable cards
// ---------------------------------------------------------------------------
export function HaulingSection({ data }: { data: DriverCompare[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const selected = data.find((d) => d.label === sel);
  return (
    <div>
      <div className="flex gap-4">
        {data.map((h) => (
          <button
            type="button"
            key={h.label}
            onClick={() => setSel((s) => (s === h.label ? null : h.label))}
            className={`flex-1 rounded-card border-[3px] p-4 text-center transition-colors ${
              sel === h.label ? 'border-orange bg-lime/20' : 'border-lime hover:border-orange'
            }`}
          >
            <div className="text-xs font-extrabold uppercase tracking-wide text-fg-2">{h.label}</div>
            <div className="mt-1 font-display text-3xl text-orange">{fmtUsd(h.median)}</div>
            <div className="mt-1 text-xs text-fg-3">{h.count} jobs</div>
          </button>
        ))}
      </div>
      <Hint>Click a card to list its invoices.</Hint>
      {selected && <JobTable title={selected.label} items={selected.items} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Height grid — clickable cells
// ---------------------------------------------------------------------------
export function HeightGridSection({ grid }: { grid: HeightGrid }) {
  const [sel, setSel] = useState<string | null>(null);
  // Find the selected cell's items + a readable title.
  let selItems: JobRef[] | null = null;
  let selTitle = '';
  for (const row of grid.rows) {
    row.cells.forEach((c, ci) => {
      const key = `${row.band}|${ci}`;
      if (c && key === sel) {
        selItems = c.items;
        selTitle = `${row.band} · ${grid.heightCols[ci]}`;
      }
    });
  }
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-fg-2">
              <th className="py-1 pr-3 font-extrabold uppercase tracking-wide">Size</th>
              {grid.heightCols.map((c) => (
                <th key={c} className="py-1 pr-3 font-extrabold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.band} className="border-t border-bark/10">
                <td className="py-1.5 pr-3 font-bold text-ink">{row.band}</td>
                {row.cells.map((c, ci) => {
                  const key = `${row.band}|${ci}`;
                  return (
                    <td key={ci} className="py-1.5 pr-3">
                      {c ? (
                        <button
                          type="button"
                          onClick={() => setSel((s) => (s === key ? null : key))}
                          className={`rounded-md px-2 py-0.5 font-bold text-ink transition-colors hover:bg-lime/30 ${
                            sel === key ? 'bg-lime/40' : ''
                          }`}
                        >
                          {fmtUsd(c.median)}
                        </button>
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint>Click any price to list its invoices.</Hint>
      {selItems && <JobTable title={selTitle} items={selItems} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal median bars (sellers, species) — clickable bars
// ---------------------------------------------------------------------------
function MedianBarSection({
  data,
  highlightSpread,
  noun,
}: {
  data: DriverCompare[];
  highlightSpread?: boolean;
  noun: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const selected = data.find((d) => d.label === sel);
  const medians = data.map((d) => d.median);
  const min = Math.min(...medians);
  const max = Math.max(...medians);
  const height = Math.max(160, data.length * 34 + 40);

  function baseColor(label: string, median: number): string {
    if (!highlightSpread) return ORANGE;
    if (median === max) return ORANGE;
    if (median === min) return BARK;
    return '#C97A4A';
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 60, bottom: 6, left: 10 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={usd0} tick={{ fontSize: 11, fill: BARK }} />
          <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12, fill: BARK }} />
          <Tooltip
            cursor={{ fill: 'rgba(235,76,27,0.08)' }}
            formatter={(v: number, _n, p) => [`${usd0(v)} (n=${p.payload.count})`, 'Median']}
          />
          <Bar
            dataKey="median"
            radius={[0, 4, 4, 0]}
            onClick={(d: { label?: string }) => d?.label && setSel((s) => (s === d.label ? null : d.label!))}
            className="cursor-pointer"
          >
            {data.map((d) => (
              <Cell
                key={d.label}
                fill={sel && sel !== d.label ? DIM : baseColor(d.label, d.median)}
              />
            ))}
            <LabelList dataKey="median" position="right" formatter={usd0} style={{ fontSize: 11, fill: BARK }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Hint>Click a {noun}&apos;s bar to list its invoices.</Hint>
      {selected && <JobTable title={selected.label} items={selected.items} />}
    </div>
  );
}

export function SellerSection({ data }: { data: DriverCompare[] }) {
  return <MedianBarSection data={data} highlightSpread noun="salesperson" />;
}

export function SpeciesSection({ data }: { data: DriverCompare[] }) {
  return <MedianBarSection data={data} noun="species" />;
}

'use client';

// ============================================================================
// Cost-analysis charts (client). Pure presentation: every number is computed
// server-side in lib/cost-analysis.ts and handed in as props. Recharts must
// run on the client, so this is the one 'use client' island on the page.
// ============================================================================

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import type { ScatterPoint, BandStat, DriverCompare } from '@/lib/cost-analysis';

// Brand palette (mirrors globals.css custom properties).
const ORANGE = '#EB4C1B';
const BARK = '#26190E';
const LIME = '#B7B400';
const GRID = '#E7DFCE';

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

// ---------------------------------------------------------------------------
// Hero: price vs. trunk size (DBH)
// ---------------------------------------------------------------------------
export function PriceVsSizeScatter({ points }: { points: ScatterPoint[] }) {
  const haul = points.filter((p) => p.haul);
  const noHaul = points.filter((p) => !p.haul);
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis
          type="number"
          dataKey="dbh"
          name="Trunk size"
          unit='"'
          tick={{ fontSize: 12, fill: BARK }}
          label={{ value: 'Trunk diameter (DBH, inches)', position: 'bottom', offset: 10, fill: BARK, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="price"
          name="Price"
          tickFormatter={usd0}
          tick={{ fontSize: 12, fill: BARK }}
          width={70}
        />
        <ZAxis range={[26, 26]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(v: number, name: string) =>
            name === 'Price' ? usd0(v) : `${v}"`
          }
        />
        <Legend verticalAlign="top" height={28} />
        <Scatter name="With hauling" data={haul} fill={ORANGE} fillOpacity={0.55} />
        <Scatter name="No hauling" data={noHaul} fill={BARK} fillOpacity={0.55} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Typical (median) price by size band
// ---------------------------------------------------------------------------
export function MedianBySizeBar({ bands }: { bands: BandStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={bands} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: BARK }}
          label={{ value: 'Trunk size (DBH)', position: 'bottom', offset: 10, fill: BARK, fontSize: 12 }}
        />
        <YAxis tickFormatter={usd0} tick={{ fontSize: 12, fill: BARK }} width={70} />
        <Tooltip formatter={(v: number) => usd0(v)} />
        <Bar dataKey="median" name="Typical price" fill={ORANGE} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="median" position="top" formatter={usd0} style={{ fontSize: 11, fill: BARK }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Horizontal median-price comparison (sellers, species) — shared component
// ---------------------------------------------------------------------------
function HorizontalMedianBar({
  data,
  highlightSpread,
}: {
  data: DriverCompare[];
  highlightSpread?: boolean;
}) {
  // When highlighting spread (sellers), color the cheapest/priciest to make
  // the inconsistency pop; otherwise a flat orange.
  const medians = data.map((d) => d.median);
  const min = Math.min(...medians);
  const max = Math.max(...medians);
  const height = Math.max(160, data.length * 34 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 6, right: 60, bottom: 6, left: 10 }}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={usd0} tick={{ fontSize: 11, fill: BARK }} />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tick={{ fontSize: 12, fill: BARK }}
        />
        <Tooltip
          formatter={(v: number, _n, p) => [`${usd0(v)} (n=${p.payload.count})`, 'Median']}
        />
        <Bar dataKey="median" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                highlightSpread
                  ? d.median === max
                    ? ORANGE
                    : d.median === min
                    ? BARK
                    : '#C97A4A'
                  : ORANGE
              }
            />
          ))}
          <LabelList dataKey="median" position="right" formatter={usd0} style={{ fontSize: 11, fill: BARK }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SellerComparisonBar({ data }: { data: DriverCompare[] }) {
  return <HorizontalMedianBar data={data} highlightSpread />;
}

export function SpeciesComparisonBar({ data }: { data: DriverCompare[] }) {
  return <HorizontalMedianBar data={data} />;
}

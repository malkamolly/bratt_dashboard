'use client';

// ============================================================================
// Hero chart (client): price vs. trunk size. Non-interactive overview — the
// click-to-drill sections live in Sections.tsx. Recharts must run client-side.
// ============================================================================

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ScatterPoint } from '@/lib/cost-analysis';

const ORANGE = '#EB4C1B';
const BARK = '#26190E';

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function PriceVsSizeScatter({ points }: { points: ScatterPoint[] }) {
  const haul = points.filter((p) => p.haul);
  const noHaul = points.filter((p) => !p.haul);
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid stroke="#E7DFCE" />
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
          formatter={(v: number, name: string) => (name === 'Price' ? usd0(v) : `${v}"`)}
        />
        <Legend verticalAlign="top" height={28} />
        <Scatter name="With hauling" data={haul} fill={ORANGE} fillOpacity={0.55} />
        <Scatter name="No hauling" data={noHaul} fill={BARK} fillOpacity={0.55} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

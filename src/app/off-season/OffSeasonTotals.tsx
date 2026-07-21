'use client';

// ============================================================================
// Season totals visual (client): one horizontal bar per window (Nov–Dec,
// Jan–March). Each bar stacks booked revenue by work type — orange discounted
// + green dormant — with a faint track showing what's left to that window's
// combined goal. Colors are tuned for the DARK panel it sits on, so all axis
// text and gridlines are cream, not ink.
// ============================================================================

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const ORANGE = '#EB4C1B';
const GREEN = '#72BB32'; // brighter green reads better on dark than green-dark
const TRACK_FILL = 'rgba(255,248,236,0.12)'; // faint cream = "left to goal"
const CREAM = '#FFF8EC';
const CREAM_DIM = 'rgba(255,248,236,0.65)';
const GRID = 'rgba(255,248,236,0.14)';

export type TotalsBar = {
  name: string;
  discounted: number;
  dormant: number;
  goal: number;
};

const usdShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};
const usdFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

const LABELS: Record<string, string> = {
  discounted: 'Discounted',
  dormant: 'Dormant',
  remaining: 'Left to goal',
};

export function OffSeasonTotals({ bars }: { bars: TotalsBar[] }) {
  const data = bars.map((b) => ({
    ...b,
    remaining: Math.max(b.goal - b.discounted - b.dormant, 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
        barCategoryGap={24}
      >
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={usdShort}
          tick={{ fontSize: 11, fill: CREAM_DIM }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={84}
          tick={{ fontSize: 13, fill: CREAM, fontWeight: 800 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,248,236,0.06)' }}
          formatter={(v: number, key: string) => [usdFull(v), LABELS[key] ?? key]}
          contentStyle={{
            borderRadius: 12,
            border: 'none',
            background: '#3D2B14',
            color: CREAM,
            fontSize: 12,
          }}
          labelStyle={{ color: CREAM }}
        />
        <Bar dataKey="discounted" stackId="a" fill={ORANGE} radius={[4, 0, 0, 4]} />
        <Bar dataKey="dormant" stackId="a" fill={GREEN} />
        <Bar dataKey="remaining" stackId="a" fill={TRACK_FILL} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

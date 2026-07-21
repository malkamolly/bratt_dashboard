'use client';

// ============================================================================
// Season totals visual (client): one horizontal bar per window (Nov–Dec,
// Jan–March). Each bar stacks the booked revenue by work type — orange
// discounted + green dormant — with the rest of the bar showing what's left
// to that window's combined goal.
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
const GREEN = '#448629';
const TRACK_FILL = '#E8DCC0'; // paper-edge — the "remaining to goal" portion

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
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        barCategoryGap={22}
      >
        <CartesianGrid stroke="#E7DFCE" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={usdShort}
          tick={{ fontSize: 11, fill: '#26190E' }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={84}
          tick={{ fontSize: 13, fill: '#26190E', fontWeight: 800 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(38,25,14,0.04)' }}
          formatter={(v: number, key: string) => [usdFull(v), LABELS[key] ?? key]}
          contentStyle={{
            borderRadius: 12,
            border: '2px solid #E7DFCE',
            fontSize: 12,
          }}
        />
        <Bar dataKey="discounted" stackId="a" fill={ORANGE} radius={[4, 0, 0, 4]} />
        <Bar dataKey="dormant" stackId="a" fill={GREEN} />
        <Bar dataKey="remaining" stackId="a" fill={TRACK_FILL} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

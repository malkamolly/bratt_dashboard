'use client';

// ============================================================================
// Season totals visual (client): one horizontal bar per track, showing booked
// revenue filling toward that track's goal. Discounted = orange, Dormant =
// green, so the two work types read apart at a glance.
// ============================================================================

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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
  workType: 'discounted' | 'dormant';
  booked: number;
  goal: number;
};

const usdShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};
const usdFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function OffSeasonTotals({ bars }: { bars: TotalsBar[] }) {
  // Stack "booked" + "remaining" so each bar reads as a progress bar toward its
  // goal. remaining is 0 when a track is already over goal.
  const data = bars.map((b) => ({
    ...b,
    remaining: Math.max(b.goal - b.booked, 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
        barCategoryGap={14}
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
          width={132}
          tick={{ fontSize: 12, fill: '#26190E', fontWeight: 700 }}
        />
        <Tooltip
          cursor={{ fill: 'rgba(38,25,14,0.04)' }}
          formatter={(v: number, key: string, item) => {
            if (key === 'booked') return [usdFull(v), 'Booked'];
            const goal = (item?.payload?.goal as number) ?? 0;
            return [usdFull(goal), 'Goal'];
          }}
          contentStyle={{
            borderRadius: 12,
            border: '2px solid #E7DFCE',
            fontSize: 12,
          }}
        />
        <Bar dataKey="booked" stackId="a" radius={[4, 0, 0, 4]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.workType === 'discounted' ? ORANGE : GREEN} />
          ))}
        </Bar>
        <Bar dataKey="remaining" stackId="a" fill={TRACK_FILL} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

'use client';

// ============================================================================
// Off-Season pace chart (client — recharts must run client-side).
// ============================================================================
// One chart per window: combined scheduled revenue (orange area) against the
// even-pace goal ramp (dashed bark line). Scheduled above the dashed line =
// ahead of pace for today's date.
// ============================================================================

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { SeriesPoint } from '@/lib/off-season-data';

const ORANGE = '#EB4C1B';
const BARK = '#26190E';

const usdShort = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
};

const usdFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function OffSeasonChart({ series }: { series: SeriesPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-2 border-2 border-dashed border-paper-edge bg-paper/40 px-6 text-center text-sm text-fg-3">
        No daily numbers entered yet. Once you start logging days, the scheduled
        pace shows up here.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart
        data={series}
        margin={{ top: 10, right: 12, bottom: 4, left: 4 }}
      >
        <defs>
          <linearGradient id="schedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORANGE} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ORANGE} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#E7DFCE" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fontSize: 11, fill: BARK }}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={usdShort}
          tick={{ fontSize: 11, fill: BARK }}
          width={52}
        />
        <Tooltip
          labelFormatter={(iso) => shortDate(String(iso))}
          formatter={(v: number) => [usdFull(v), 'Scheduled']}
          contentStyle={{
            borderRadius: 12,
            border: '2px solid #E7DFCE',
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="scheduled"
          stroke={ORANGE}
          strokeWidth={2.5}
          fill="url(#schedFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

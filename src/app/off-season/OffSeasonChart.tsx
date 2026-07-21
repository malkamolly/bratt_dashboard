'use client';

// ============================================================================
// Off-Season pace chart (client — recharts must run client-side).
// ============================================================================
// One chart per work type: the cumulative booked revenue (orange area) against
// the even-pace goal ramp (dashed bark line). Where the orange sits above the
// dashed line, we're ahead of pace; below it, behind.
// ============================================================================

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
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

// "2025-11-08" -> "Nov 8"
const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function OffSeasonChart({ series }: { series: SeriesPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-2 border-2 border-dashed border-paper-edge bg-paper/40 px-6 text-center text-sm text-fg-3">
        No daily numbers entered yet. Once you start logging days, the booking
        pace shows up here.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart
        data={series}
        margin={{ top: 10, right: 12, bottom: 4, left: 4 }}
      >
        <defs>
          <linearGradient id="bookedFill" x1="0" y1="0" x2="0" y2="1">
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
          formatter={(v: number, name: string) => [
            usdFull(v),
            name === 'booked' ? 'Booked' : 'Goal pace',
          ]}
          contentStyle={{
            borderRadius: 12,
            border: '2px solid #E7DFCE',
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="booked"
          stroke={ORANGE}
          strokeWidth={2.5}
          fill="url(#bookedFill)"
        />
        <Line
          type="monotone"
          dataKey="ramp"
          stroke={BARK}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

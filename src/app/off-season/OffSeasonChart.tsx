'use client';

// ============================================================================
// Off-Season pace chart (client — recharts must run client-side).
// ============================================================================
// One chart per track: sold revenue (orange area, the primary metric) against
// the even-pace goal ramp (dashed bark line), with scheduled revenue (teal
// line) riding underneath so you can see how much of what's sold is on the
// calendar. Sold above the dashed line = ahead of pace.
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
  Legend,
} from 'recharts';
import type { SeriesPoint } from '@/lib/off-season-data';

const ORANGE = '#EB4C1B';
const TEAL = '#0096AA';
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

const SERIES_LABELS: Record<string, string> = {
  sold: 'Sold',
  scheduled: 'Scheduled',
  ramp: 'Goal pace',
};

export function OffSeasonChart({ series }: { series: SeriesPoint[] }) {
  if (series.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-2 border-2 border-dashed border-paper-edge bg-paper/40 px-6 text-center text-sm text-fg-3">
        No daily numbers entered yet. Once you start logging days, sold and
        scheduled pace show up here.
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
          <linearGradient id="soldFill" x1="0" y1="0" x2="0" y2="1">
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
            SERIES_LABELS[name] ?? name,
          ]}
          contentStyle={{
            borderRadius: 12,
            border: '2px solid #E7DFCE',
            fontSize: 12,
          }}
        />
        <Legend
          verticalAlign="top"
          height={24}
          formatter={(name: string) => SERIES_LABELS[name] ?? name}
          wrapperStyle={{ fontSize: 11 }}
        />
        <Area
          type="monotone"
          dataKey="sold"
          stroke={ORANGE}
          strokeWidth={2.5}
          fill="url(#soldFill)"
        />
        <Line
          type="monotone"
          dataKey="scheduled"
          stroke={TEAL}
          strokeWidth={2}
          dot={false}
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

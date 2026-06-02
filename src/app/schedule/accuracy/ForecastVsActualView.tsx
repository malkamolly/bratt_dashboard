'use client';

// ============================================================================
// Forecast vs Actual — interactive chart + per-day table
// ============================================================================
// Client component because Recharts and the work-type toggle need the browser.
// All the data crunching already happened server-side in
// `loadForecastVsActual`; here we just pick a "view" (All work, or one work
// type) and render forecast vs actual side by side.
// ============================================================================

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { fmtUsd, fmtPct } from '@/lib/format';
import { fromIsoDate, type IsoDate } from '@/lib/dates';
import {
  FORECAST_CATEGORIES,
  FORECAST_CATEGORY_LABEL,
  type ForecastCategory,
  type DayComparison,
} from '@/lib/forecast-actual-types';

const FORECAST_COLOR = '#0096AA'; // teal — "the plan"
const ACTUAL_COLOR = '#EB4C1B'; // orange — "what happened"

type View = 'all' | ForecastCategory;

function dayLabel(iso: IsoDate): string {
  return fromIsoDate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function shortDayLabel(iso: IsoDate): string {
  return fromIsoDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Pull the forecast/actual numbers for a single day under the chosen view.
function pick(day: DayComparison, view: View): { forecast: number; actual: number } {
  if (view === 'all') {
    return { forecast: day.forecastTotal, actual: day.actualTotal };
  }
  return { forecast: day.forecast[view], actual: day.actual[view] };
}

function yTick(v: number): string {
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

export default function ForecastVsActualView({ days }: { days: DayComparison[] }) {
  const [view, setView] = useState<View>('all');

  const chartData = useMemo(
    () =>
      days.map((d) => {
        const { forecast, actual } = pick(d, view);
        return {
          label: shortDayLabel(d.date),
          dateIso: d.date,
          Forecast: Math.round(forecast),
          Actual: Math.round(actual),
        };
      }),
    [days, view],
  );

  const viewTotals = useMemo(() => {
    let forecast = 0;
    let actual = 0;
    for (const d of days) {
      const p = pick(d, view);
      forecast += p.forecast;
      actual += p.actual;
    }
    return { forecast, actual, variance: actual - forecast };
  }, [days, view]);

  const views: { key: View; label: string }[] = [
    { key: 'all', label: 'All Work' },
    ...FORECAST_CATEGORIES.map((c) => ({
      key: c as View,
      label: FORECAST_CATEGORY_LABEL[c],
    })),
  ];

  if (days.length === 0) {
    return (
      <section className="mt-8 rounded-card border-[3px] border-paper-edge bg-white p-8 text-center">
        <p className="font-headline text-lg font-black uppercase text-bark-deep">
          No data for this month yet
        </p>
        <p className="mt-2 text-sm text-fg-2">
          This page compares the saved daily schedule against booked production.
          Once there&rsquo;s a schedule or a production entry for a day this
          month, it&rsquo;ll show up here.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-8">
      {/* Work-type toggle */}
      <div className="flex flex-wrap gap-2" data-screenshot-ignore="true">
        {views.map((v) => {
          const active = v.key === view;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={
                active
                  ? 'rounded-full bg-orange px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-white'
                  : 'rounded-full border-2 border-ink/15 bg-white px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2 hover:border-orange hover:text-ink'
              }
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {/* View summary */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-3">
          {view === 'all' ? 'All Work' : FORECAST_CATEGORY_LABEL[view]} — month total
        </span>
        <span className="text-sm text-fg-2">
          Forecast <strong className="text-ink">{fmtUsd(viewTotals.forecast)}</strong>
        </span>
        <span className="text-sm text-fg-2">
          Actual <strong className="text-ink">{fmtUsd(viewTotals.actual)}</strong>
        </span>
        <VarianceTag forecast={viewTotals.forecast} actual={viewTotals.actual} />
      </div>

      {/* Chart */}
      <div className="mt-4 rounded-card border-[3px] border-bark bg-white p-4 sm:p-6">
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DCC0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#7A6B55' }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: '#7A6B55' }} tickFormatter={yTick} width={48} />
              <Tooltip
                formatter={(value: number) => fmtUsd(value)}
                labelFormatter={(_label, payload) => {
                  const iso = payload?.[0]?.payload?.dateIso as IsoDate | undefined;
                  return iso ? dayLabel(iso) : '';
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: '2px solid #3D2B14',
                  fontSize: 13,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Forecast" fill={FORECAST_COLOR} radius={[3, 3, 0, 0]} />
              <Bar dataKey="Actual" fill={ACTUAL_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-day detail table */}
      <section className="mt-8">
        <h2 className="font-headline text-xl font-black uppercase tracking-ribbon text-ink">
          Day by day
        </h2>
        <div className="mt-4 overflow-x-auto rounded-card border-[3px] border-lime bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper-edge/40 text-fg-2">
              <tr>
                <th className="px-4 py-2 font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Day
                </th>
                <th className="px-4 py-2 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Forecast
                </th>
                <th className="px-4 py-2 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Actual
                </th>
                <th className="px-4 py-2 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Difference
                </th>
                <th className="px-4 py-2 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Hit rate
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, idx) => {
                const { forecast, actual } = pick(d, view);
                const diff = actual - forecast;
                const hit = forecast > 0 ? actual / forecast : null;
                return (
                  <tr key={d.date} className={idx % 2 === 0 ? 'bg-white' : 'bg-paper/40'}>
                    <td className="px-4 py-2 font-headline font-bold text-ink">
                      {dayLabel(d.date)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtUsd(forecast)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtUsd(actual)}</td>
                    <td
                      className={
                        'px-4 py-2 text-right tabular-nums font-bold ' +
                        (diff >= 0 ? 'text-green-dark' : 'text-orange-press')
                      }
                    >
                      {diff >= 0 ? '+' : '−'}
                      {fmtUsd(Math.abs(diff))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg-2">
                      {hit != null ? fmtPct(hit) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fg-3">
          &ldquo;Forecast&rdquo; is the saved schedule for that day, with multi-day
          jobs split evenly across their days. &ldquo;Actual&rdquo; is booked
          production revenue. A positive difference means the crews booked more
          than was scheduled.
        </p>
      </section>
    </div>
  );
}

function VarianceTag({ forecast, actual }: { forecast: number; actual: number }) {
  const diff = actual - forecast;
  if (forecast === 0 && actual === 0) {
    return <span className="bt-status-neutral">No data</span>;
  }
  const cls = diff >= 0 ? 'bt-status-ahead' : 'bt-status-behind';
  return (
    <span className={cls}>
      {diff >= 0 ? '+' : '−'}
      {fmtUsd(Math.abs(diff))} vs forecast
    </span>
  );
}

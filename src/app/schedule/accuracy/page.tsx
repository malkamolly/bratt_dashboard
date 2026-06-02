import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import {
  loadForecastVsActual,
  FORECAST_CATEGORIES,
  FORECAST_CATEGORY_LABEL,
} from '@/lib/forecast-actual-data';
import { fmtUsd, fmtPct, monthLabel } from '@/lib/format';
import { MonthPicker } from '@/components/MonthPicker';
import { CopyAsImageButton } from '@/components/CopyAsImageButton';
import ForecastVsActualView from './ForecastVsActualView';

export const dynamic = 'force-dynamic';

type Search = Promise<{ year?: string; month?: string }>;

function parseIntInRange(raw: string | undefined, min: number, max: number) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export default async function ForecastAccuracyPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin' && user.role !== 'user') redirect('/access-denied');

  const sp = await searchParams;
  const now = new Date();
  const year = parseIntInRange(sp.year, 2000, 2100) ?? now.getFullYear();
  const month = parseIntInRange(sp.month, 1, 12) ?? now.getMonth() + 1;

  const data = await loadForecastVsActual(year, month);
  const { totals } = data;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-3 flex justify-end">
        <CopyAsImageButton targetId="forecast-accuracy-snapshot" />
      </div>

      <div id="forecast-accuracy-snapshot">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="bt-eyebrow">
              <Link href="/" className="hover:underline">
                Bratt Tree
              </Link>
              <span className="mx-2 text-fg-3">/</span>
              <Link href="/pace" className="hover:underline">
                Pace
              </Link>
              <span className="mx-2 text-fg-3">/</span>
              Forecast vs Actual
            </p>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl tracking-wider text-ink uppercase">
              Forecast vs Actual
            </h1>
            <p className="mt-3 max-w-2xl text-fg-2">
              {monthLabel(year, month)} &mdash; what we scheduled for each day
              versus what the crews actually booked.
            </p>
          </div>
          <div data-screenshot-ignore="true">
            <MonthPicker year={year} month={month} basePath="/schedule/accuracy" />
          </div>
        </section>

        {/* Summary cards: one per work type + a combined total */}
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            label="All Work"
            forecast={totals.forecastTotal}
            actual={totals.actualTotal}
            highlight
          />
          {FORECAST_CATEGORIES.map((cat) => (
            <SummaryCard
              key={cat}
              label={FORECAST_CATEGORY_LABEL[cat]}
              forecast={totals.forecast[cat]}
              actual={totals.actual[cat]}
            />
          ))}
        </section>

        <ForecastVsActualView days={data.days} />
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  forecast,
  actual,
  highlight,
}: {
  label: string;
  forecast: number;
  actual: number;
  highlight?: boolean;
}) {
  const diff = actual - forecast;
  const hit = forecast > 0 ? actual / forecast : null;
  const hasData = forecast !== 0 || actual !== 0;

  return (
    <div className={highlight ? 'bt-card-orange' : 'bt-card'}>
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </p>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div>
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Forecast
          </p>
          <p className="font-headline text-xl font-black text-ink">{fmtUsd(forecast)}</p>
        </div>
        <div className="text-right">
          <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Actual
          </p>
          <p className="font-headline text-xl font-black text-ink">{fmtUsd(actual)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-paper-edge pt-2">
        {hasData ? (
          <>
            <span
              className={
                'font-headline text-sm font-black ' +
                (diff >= 0 ? 'text-green-dark' : 'text-orange-press')
              }
            >
              {diff >= 0 ? '+' : '−'}
              {fmtUsd(Math.abs(diff))}
            </span>
            <span className="text-xs text-fg-3">
              {hit != null ? `${fmtPct(hit)} of forecast` : 'no forecast'}
            </span>
          </>
        ) : (
          <span className="text-xs text-fg-3">No data this month</span>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import {
  loadDayComparison,
  FORECAST_CATEGORY_LABEL,
  type DayComparisonRow,
} from '@/lib/forecast-actual-data';
import { fmtUsd, fmtPct } from '@/lib/format';
import { toIsoDate, fromIsoDate } from '@/lib/dates';
import { CopyAsImageButton } from '@/components/CopyAsImageButton';
import { DayPicker } from './DayPicker';

export const dynamic = 'force-dynamic';

type Search = Promise<{ date?: string }>;

function validIsoDate(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

function longDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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
  const date = validIsoDate(sp.date) ? sp.date : toIsoDate(new Date());

  const data = await loadDayComparison(date);
  const diffTotal = data.actualTotal - data.projectedTotal;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
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
            <p className="mt-3 text-fg-2">{longDate(date)}</p>
          </div>
          <DayPicker date={date} />
        </section>

        {/* Status banner when one side is missing */}
        {(!data.hasSchedule || !data.hasActual) && (
          <div className="mt-5 rounded-card border-2 border-status-warn/40 bg-status-warn/10 px-4 py-3 text-sm text-fg-2">
            {!data.hasSchedule && !data.hasActual ? (
              <>Nothing recorded for this day — no schedule was saved and no production was entered.</>
            ) : !data.hasSchedule ? (
              <>No schedule was saved for this day, so the projected column shows $0. The actuals below are real.</>
            ) : (
              <>No production has been entered for this day yet, so the actual column shows $0. Once today&rsquo;s numbers are entered, this will fill in.</>
            )}
          </div>
        )}

        {/* Three big totals: Projected | Actual | Difference */}
        <section className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
          <TotalCard label="Projected" sublabel="Tomorrow's Schedule" value={data.projectedTotal} />
          <TotalCard label="Actual" sublabel="Production Pace" value={data.actualTotal} />
          <DiffCard projected={data.projectedTotal} actual={data.actualTotal} />
        </section>

        {/* Per-work-type breakdown, same three columns */}
        <section className="mt-8 overflow-x-auto rounded-card border-[3px] border-lime bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper-edge/40 text-fg-2">
              <tr>
                <th className="px-4 py-3 font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Work Type
                </th>
                <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Projected
                </th>
                <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Actual
                </th>
                <th className="px-4 py-3 text-right font-headline text-xs font-extrabold uppercase tracking-ribbon">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, idx) => (
                <Row key={r.category} row={r} striped={idx % 2 === 1} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink/10 bg-bark text-cream">
                <td className="px-4 py-3 font-headline font-black uppercase tracking-ribbon">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-headline font-black tabular-nums">
                  {fmtUsd(data.projectedTotal)}
                </td>
                <td className="px-4 py-3 text-right font-headline font-black tabular-nums">
                  {fmtUsd(data.actualTotal)}
                </td>
                <td className="px-4 py-3 text-right font-headline font-black tabular-nums">
                  <DiffText diff={diffTotal} onDark />
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <p className="mt-3 text-xs text-fg-3">
          &ldquo;Projected&rdquo; is the saved schedule for this day, with multi-day jobs split
          evenly across their days. &ldquo;Actual&rdquo; is booked production revenue. A positive
          difference (green) means the crews booked more than was scheduled.
          {data.scheduleUpdatedBy && (
            <> &middot; Schedule last saved by {data.scheduleUpdatedBy}.</>
          )}
        </p>
      </div>
    </main>
  );
}

function Row({ row, striped }: { row: DayComparisonRow; striped: boolean }) {
  const diff = row.actual - row.projected;
  return (
    <tr className={striped ? 'bg-paper/40' : 'bg-white'}>
      <td className="px-4 py-3 font-headline font-bold text-ink">
        {FORECAST_CATEGORY_LABEL[row.category]}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(row.projected)}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(row.actual)}</td>
      <td className="px-4 py-3 text-right tabular-nums font-bold">
        <DiffText diff={diff} />
      </td>
    </tr>
  );
}

function DiffText({ diff, onDark }: { diff: number; onDark?: boolean }) {
  if (Math.round(diff) === 0) {
    return <span className={onDark ? 'text-cream/70' : 'text-fg-3'}>$0</span>;
  }
  const up = diff > 0;
  const cls = onDark
    ? up
      ? 'text-lime'
      : 'text-apricot'
    : up
      ? 'text-green-dark'
      : 'text-orange-press';
  return (
    <span className={cls}>
      {up ? '+' : '−'}
      {fmtUsd(Math.abs(diff))}
    </span>
  );
}

function TotalCard({
  label,
  sublabel,
  value,
}: {
  label: string;
  sublabel: string;
  value: number;
}) {
  return (
    <div className="bt-card">
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </p>
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        {sublabel}
      </p>
      <p className="mt-2 font-headline text-2xl font-black text-ink sm:text-3xl">
        {fmtUsd(value)}
      </p>
    </div>
  );
}

function DiffCard({ projected, actual }: { projected: number; actual: number }) {
  const diff = actual - projected;
  const hit = projected > 0 ? actual / projected : null;
  const up = diff >= 0;
  return (
    <div className={up ? 'bt-card-orange' : 'bt-card'}>
      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
        Difference
      </p>
      <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
        Actual − Projected
      </p>
      <p
        className={
          'mt-2 font-headline text-2xl font-black sm:text-3xl ' +
          (Math.round(diff) === 0 ? 'text-fg-2' : up ? 'text-green-dark' : 'text-orange-press')
        }
      >
        {Math.round(diff) === 0 ? '$0' : `${up ? '+' : '−'}${fmtUsd(Math.abs(diff))}`}
      </p>
      {hit != null && (
        <p className="mt-1 text-xs text-fg-3">{fmtPct(hit)} of projection</p>
      )}
    </div>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import { getAllowedUser } from '@/lib/auth';
import { loadYearToDate } from '@/lib/sales-data';
import { fmtUsd, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const user = await getAllowedUser();
  const ytd = user ? await loadYearToDate() : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="mb-10 flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="bt-eyebrow">Bratt Tree Company</p>
          <h1 className="mt-2 font-display text-5xl sm:text-6xl tracking-wider text-ink uppercase">
            Pace Dashboard
          </h1>
          <p className="mt-4 max-w-xl text-fg-2">
            Daily sales and production pace, the way the team actually works. No more spreadsheets that break.
          </p>
        </div>
        <Image
          src="/brand/mascot.png"
          alt=""
          width={140}
          height={140}
          className="mt-6 sm:mt-0"
          priority
        />
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link href="/sales" className="bt-card group transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Dashboard 1</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            Sales PACE
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Daily sales by salesperson, MTD totals, monthly goal progress, and what each rep needs per day to hit budget.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open dashboard &rarr;
          </p>
        </Link>

        <Link href="/production" className="bt-card group transition-colors hover:!border-orange">
          <p className="bt-eyebrow">Dashboard 2</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            Production PACE
          </h2>
          <p className="mt-3 text-sm text-fg-2">
            Production crews and Plant Healthcare side-by-side. Jobs, revenue, pacing, and average job size.
          </p>
          <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
            Open dashboard &rarr;
          </p>
        </Link>
      </section>

      {ytd && ytd.byMonth.length > 0 ? (
        <YtdCard ytd={ytd} />
      ) : (
        <section className="mt-10 rounded-card bg-bark p-6 text-cream">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
                YTD vs. Annual Target
              </p>
              <p className="mt-1 font-headline text-2xl font-black uppercase">
                Yearly target &mdash; coming soon
              </p>
              <p className="mt-1 text-sm text-cream/80">
                Set the annual goal in the admin panel and we&apos;ll show running progress here.
              </p>
            </div>
            <Link href="/admin" className="bt-btn bt-btn-primary">
              Open Admin
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

function YtdCard({
  ytd,
}: {
  ytd: Awaited<ReturnType<typeof loadYearToDate>>;
}) {
  const pct = ytd.annualGoal && ytd.annualGoal > 0 ? ytd.ytdTotal / ytd.annualGoal : null;
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return (
    <section className="mt-10 rounded-card bg-bark p-6 text-cream sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
            Year-To-Date {ytd.year}
          </p>
          <p className="mt-2 font-display text-5xl tracking-wider sm:text-6xl">
            {fmtUsd(ytd.ytdTotal)}
          </p>
          {ytd.annualGoal != null ? (
            <p className="mt-1 text-sm text-cream/80">
              of {fmtUsd(ytd.annualGoal)} annual goal &middot; {pct != null ? fmtPct(pct) : '—'}
            </p>
          ) : (
            <p className="mt-1 text-sm text-cream/80">
              Annual goal not set yet.
            </p>
          )}
        </div>
        <Link href="/sales" className="bt-btn bt-btn-primary">
          Open Sales PACE
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const row = ytd.byMonth.find((b) => b.month === m);
          const isLive = row?.source === 'daily';
          return (
            <Link
              key={m}
              href={`/sales?year=${ytd.year}&month=${m}`}
              className="rounded-2 bg-bark-deep/60 px-2 py-2 text-center hover:bg-bark-deep"
            >
              <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream/70">
                {monthNames[m - 1]}
                {isLive ? ' · Live' : ''}
              </p>
              <p className="mt-1 font-headline text-sm font-black text-cream">
                {row ? fmtUsd(row.total) : '—'}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

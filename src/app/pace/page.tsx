import Image from 'next/image';
import Link from 'next/link';
import { requireHubAccess } from '@/lib/auth';
import { loadYearToDate } from '@/lib/sales-data';
import { loadProductionYearToDate } from '@/lib/production-data';
import { fmtUsd, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PaceHomePage() {
  const user = await requireHubAccess('pace');
  const isAdmin = user.role === 'admin';

  const [salesYtd, productionYtd] = await Promise.all([
    loadYearToDate(),
    loadProductionYearToDate(),
  ]);

  const salesPct =
    salesYtd.annualGoal && salesYtd.annualGoal > 0
      ? salesYtd.ytdTotal / salesYtd.annualGoal
      : null;
  const prodPct =
    productionYtd.annualGoal && productionYtd.annualGoal > 0
      ? productionYtd.ytdRevenue / productionYtd.annualGoal
      : null;

  const year = new Date().getFullYear();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="mb-10 flex flex-col items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="bt-eyebrow">
            <Link href="/" className="hover:underline">
              Bratt Tree
            </Link>
            <span className="mx-2 text-fg-3">/</span>
            Pace
          </p>
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

      <section
        className={
          isAdmin
            ? 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'
            : 'grid grid-cols-1 gap-6 md:grid-cols-2'
        }
      >
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

        {isAdmin && (
          <Link href="/schedule" className="bt-card group transition-colors hover:!border-orange">
            <p className="bt-eyebrow">Dashboard 3 · Admin only</p>
            <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
              Tomorrow&rsquo;s Schedule
            </h2>
            <p className="mt-3 text-sm text-fg-2">
              Build the next day&rsquo;s schedule one job at a time. The dashboard adds it up, splits multi-day jobs across days, and gives leadership a clean summary.
            </p>
            <p className="mt-6 font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
              Open dashboard &rarr;
            </p>
          </Link>
        )}
      </section>

      <section className="mt-10 rounded-card bg-bark p-6 text-cream">
        <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime">
          {year} Year-to-Date — At a glance
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <YtdBlock
            label="Sales YTD"
            ytd={salesYtd.ytdTotal}
            goal={salesYtd.annualGoal}
            pct={salesPct}
            href="/sales"
          />
          <YtdBlock
            label="Production YTD"
            ytd={productionYtd.ytdRevenue}
            goal={productionYtd.annualGoal}
            pct={prodPct}
            href="/production"
          />
        </div>
      </section>
    </main>
  );
}

function YtdBlock({
  label,
  ytd,
  goal,
  pct,
  href,
}: {
  label: string;
  ytd: number;
  goal: number | null;
  pct: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2 border-2 border-cream/15 p-4 transition-colors hover:border-lime"
    >
      <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-cream/70">
        {label}
      </p>
      <p className="mt-1 font-headline text-3xl font-black">
        {fmtUsd(ytd)}
      </p>
      {goal != null && (
        <p className="mt-1 text-sm text-cream/80">
          {pct != null ? fmtPct(pct) : '—'} of {fmtUsd(goal)} goal
        </p>
      )}
      {goal == null && (
        <p className="mt-1 text-sm text-cream/60">No annual goal set yet</p>
      )}
    </Link>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { loadCostedJobs, jobCostingSummary } from '@/lib/job-costing';
import { fmtUsd, fmtPct } from '@/lib/format';
import { LaborShareChart, JobCostTable } from './JobCostingViews';

export const dynamic = 'force-dynamic';

export default async function JobCostingPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeCostAnalysis(user.email)) redirect('/access-denied');

  const jobs = loadCostedJobs();
  const s = jobCostingSummary(jobs);

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">Bratt Tree</Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/cost-analysis" className="hover:underline">Cost Analysis</Link>
        <span className="mx-2 text-fg-3">/</span>
        Job Costing
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Job Costing — Labor
      </h1>
      <p className="mt-4 max-w-3xl text-fg-2">
        A first look at what our labor actually costs on real removals. Because
        the system-wide timesheet export can&apos;t pull our whole crew, we
        hand-entered labor for a <strong>sample of {s.jobs} jobs</strong>{' '}
        &mdash; a thoughtful spread of removals billed at $5,000 or more across
        the year, different crews and salespeople.
      </p>

      {/* ---- The critical caveat, up top so nobody misreads the numbers ---- */}
      <div className="mt-6 rounded-card border-[3px] border-orange bg-white/70 p-5">
        <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-orange">
          Read this first
        </p>
        <p className="mt-2 max-w-3xl text-sm text-fg-2">
          Labor here is <strong>base wages only</strong>. It does <em>not</em>{' '}
          include payroll taxes, benefits, or workers&apos; comp (which is large
          for tree work), and it does <em>not</em> include equipment, fuel,
          disposal, sales commission, or overhead. So{' '}
          <strong>&ldquo;revenue minus labor&rdquo; is NOT profit.</strong> The
          number to trust is <strong>labor as a share of revenue</strong> — a
          clean read on how labor-heavy each job was.
        </p>
      </div>

      {/* ---------- Headline ---------- */}
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jobs in sample" value={String(s.jobs)} sub="$5k+ removals" />
        <Stat label="Revenue (sample)" value={fmtUsd(s.totalRevenue)} />
        <Stat label="Base labor cost" value={fmtUsd(s.totalLabor)} sub={`${s.totalHours.toLocaleString()} crew hours`} />
        <Stat
          label="Labor as % of revenue"
          value={fmtPct(s.laborPctOverall)}
          sub={`ranges ${fmtPct(s.laborPctMin)}–${fmtPct(s.laborPctMax)}`}
        />
      </section>

      {/* ---------- Table ---------- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
          The {s.jobs} jobs
        </h2>
        <p className="mt-2 mb-3 max-w-3xl text-sm text-fg-2">
          Everything at a glance — what was removed (size, height, hauling), the
          crew and their hours, revenue, base labor, and labor&apos;s share of
          the job. Multi-day jobs are shaded. (Crew shown with hours only —
          individual pay isn&apos;t stored in this tool.)
        </p>
        <JobCostTable jobs={jobs} />
      </section>

      {/* ---------- What this tells us / next ---------- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
          What this sample shows &amp; what&apos;s next
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-fg-2">
          <li>
            Base labor is a <strong>modest slice of a removal&apos;s price</strong>{' '}
            here — about {fmtPct(s.laborPctOverall)} across the sample, from as
            low as {fmtPct(s.laborPctMin)} to as high as {fmtPct(s.laborPctMax)}.
          </li>
          <li>
            <strong>Multi-day jobs cost the most labor</strong> ({fmtPct(s.multiDayLaborPct)} vs{' '}
            {fmtPct(s.singleDayLaborPct)}). When we price big jobs, days on site
            is the number to watch.
          </li>
          <li>
            The efficiency spread is real — the leanest job was{' '}
            {fmtPct(s.laborPctMin)} labor. Worth asking <em>why</em> those jobs
            went so smoothly and whether it&apos;s repeatable.
          </li>
          <li>
            <strong>To turn this into true margin</strong> we still need to add a
            loaded-labor factor (payroll tax + workers&apos; comp + benefits) and
            the other job costs — equipment, fuel, disposal, commission,
            overhead. This page is the labor foundation for that.
          </li>
        </ul>
      </section>

      {/* ---------- Labor share chart (at the bottom) ---------- */}
      <section className="bt-card mt-8">
        <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
          How labor-heavy was each job?
        </h2>
        <p className="mt-2 mb-3 max-w-3xl text-sm text-fg-2">
          Each bar is one job&apos;s base labor as a share of what it billed.{' '}
          <strong>Multi-day jobs (dark) are the labor-heavy ones</strong> &mdash;
          they run about {fmtPct(s.multiDayLaborPct)} labor vs.{' '}
          {fmtPct(s.singleDayLaborPct)} for single-day jobs. Number of days on
          site is the clearest cost driver.
        </p>
        <LaborShareChart jobs={jobs} />
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bt-card">
      <div className="text-xs font-extrabold uppercase tracking-wide text-fg-2">{label}</div>
      <div className="mt-1 font-display text-3xl text-ink sm:text-4xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-fg-3">{sub}</div>}
    </div>
  );
}

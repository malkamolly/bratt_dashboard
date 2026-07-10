import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { buildCostAnalysis, SIZE_BANDS } from '@/lib/cost-analysis';
import { fmtUsd } from '@/lib/format';
import { PriceVsSizeScatter } from './Charts';
import {
  SizeBandSection,
  HaulingSection,
  GridSection,
  SellerSection,
  SpeciesSection,
} from './Sections';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

export default async function CostAnalysisPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeCostAnalysis(user.role)) redirect('/access-denied');

  const a = buildCostAnalysis();
  const { summary: s } = a;

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Cost Analysis
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Tree Removal Cost Analysis
      </h1>
      <p className="mt-4 max-w-3xl text-fg-2">
        What we charged to remove trees over the last year, grouped by tree
        size, so we can see how consistent our pricing is and lay the
        groundwork for a standard pricing guide. Based on{' '}
        <strong>{s.totalRemovals.toLocaleString()}</strong> removal line items
        from {fmtDate(s.dateFrom)} to {fmtDate(s.dateTo)} &mdash; with{' '}
        <strong>{s.excludedMunicipal}</strong> municipal jobs set aside, since
        those are bid differently than residential work.
      </p>

      <Link
        href="/cost-analysis/job-costing"
        className="mt-6 block rounded-card border-[3px] border-orange bg-white/70 p-5 transition-colors hover:bg-lime/20"
      >
        <p className="bt-eyebrow">New — Job Costing</p>
        <p className="mt-1 font-headline text-lg font-black uppercase text-bark-deep">
          What does labor actually cost us? &rarr;
        </p>
        <p className="mt-1 text-sm text-fg-2">
          A sample of 14 big jobs with real crew hours costed out — labor as a
          share of revenue, and why multi-day jobs cost more.
        </p>
      </Link>

      {/* ---------- Headline numbers ---------- */}
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Jobs (invoices)"
          value={s.jobCount.toLocaleString()}
          sub={`${s.totalRemovals.toLocaleString()} trees across them`}
        />
        <Stat label="Total removal revenue" value={fmtUsd(s.totalRevenue)} />
        <Stat
          label="Avg. job value"
          value={fmtUsd(s.jobMean)}
          sub={`median ${fmtUsd(s.jobMedian)}`}
        />
        <Stat
          label="Comparable single-trunk trees"
          value={s.comparable.toLocaleString()}
          sub="used for size pricing below"
        />
      </section>

      {/* ---------- Per-tree vs per-job ---------- */}
      <Card title="Per tree vs. per whole job" className="mt-8">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          The size charts below price <strong>one tree at a time</strong> &mdash;
          the right unit for a pricing guide. But most invoices cover several
          trees, so a whole <strong>job</strong> bills more than any single
          tree. Both views, side by side (<em>median</em> = the middle job;{' '}
          <em>average</em> = total &divide; count, pulled up by big jobs):
        </p>
        <div className="overflow-x-auto">
          <table className="w-full max-w-xl text-sm">
            <thead>
              <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                <th className="py-2 pr-4 font-extrabold uppercase tracking-wide"></th>
                <th className="py-2 pr-4 font-extrabold uppercase tracking-wide">Median</th>
                <th className="py-2 font-extrabold uppercase tracking-wide">Average</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-bark/10">
                <td className="py-2 pr-4 font-bold text-ink">Per tree</td>
                <td className="py-2 pr-4 text-fg-2">{fmtUsd(s.medianPrice)}</td>
                <td className="py-2 text-fg-2">{fmtUsd(s.meanPrice)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-bold text-ink">Per whole job</td>
                <td className="py-2 pr-4 font-bold text-orange">{fmtUsd(s.jobMedian)}</td>
                <td className="py-2 font-bold text-orange">{fmtUsd(s.jobMean)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- Hero scatter ---------- */}
      <Card title="Price climbs with trunk size" className="mt-10">
        <p className="mb-2 text-sm text-fg-2">
          Each dot is one tree we removed. Bigger trunk (DBH = trunk diameter
          measured ~4½ ft up) means higher price &mdash; a strong, steady
          relationship. The vertical spread at any given size is exactly what a
          pricing guide would tighten up.
        </p>
        <PriceVsSizeScatter points={a.scatter} />
      </Card>

      {/* ---------- Pricing reference table + bar ---------- */}
      <Card title="Typical price by tree size" className="mt-8">
        <p className="mb-4 text-sm text-fg-2">
          The seed of a pricing guide, priced per tree. <strong>Typical</strong>{' '}
          is the median (middle) price &mdash; half cost more, half less.{' '}
          <strong>Average</strong> is higher because a few big removals pull it
          up. The <strong>normal range</strong> is the middle 50% of trees (we
          ignore the cheapest and priciest quarter), so it reflects everyday
          pricing, not freak jobs.
        </p>
        <SizeBandSection bands={a.bands} />
      </Card>

      {/* ---------- Drivers: hauling + height ---------- */}
      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <Card title="Hauling is worth about a third">
          <p className="mb-4 text-sm text-fg-2">
            Same size range ({a.refBandLabel}). Removals where we haul the
            debris away bill noticeably more than &ldquo;no hauling&rdquo; jobs
            &mdash; a clean, defensible line item for the guide.
          </p>
          <HaulingSection data={a.hauling} />
        </Card>

        <Card title="Taller trees cost more (same trunk size)">
          <p className="mb-4 text-sm text-fg-2">
            Median price by size <em>and</em> height. Reading across each row,
            price climbs with height &mdash; height is the second real driver
            after trunk size. Blank cells had too few jobs to be reliable.
          </p>
          <GridSection grid={a.heightGrid} />
        </Card>
      </section>

      {/* ---------- Crown spread (canopy width) ---------- */}
      <Card title="Crown spread (canopy width) by size" className="mt-8">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          Median price by size <em>and</em> crown spread &mdash; how wide the
          canopy is. Same layout as the height grid. Two caveats: crown spread
          is only recorded on about two-thirds of jobs (so each cell is built
          from fewer trees), and historically it&apos;s been a much weaker price
          driver than trunk size or height. We&apos;re tracking it now so
          it&apos;s ready as a factor when we build the pricing guide. Click any
          price to see its invoices; blank cells had too few jobs.
        </p>
        <GridSection grid={a.crownGrid} />
      </Card>

      {/* ---------- Seller consistency (the case for a guide) ---------- */}
      <Card title="Same-size trees, very different prices by salesperson" className="mt-8 border-orange">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          This is the clearest argument for a standard guide. Every job below is
          a single-trunk tree in the same size range ({a.refBandLabel}), so
          we&apos;re comparing like for like. The orange bar is our highest
          median price; the dark bar is our lowest. Some gap is real (access,
          difficulty) &mdash; but a spread this wide across hundreds of jobs is
          inconsistency we can tighten up.
        </p>
        <SellerSection data={a.sellers} />
      </Card>

      {/* ---------- Species ---------- */}
      <Card title="Price by species (same size range)" className="mt-8">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          Within {a.refBandLabel}, which species cost the most to remove. Large,
          brittle, or diseased-prone trees (elm, ash) run higher; small
          ornamentals run lower. A candidate modifier for the guide. Only
          species with 8+ jobs shown.
        </p>
        <SpeciesSection data={a.species} />
      </Card>

      {/* ---------- Outliers ---------- */}
      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <OutlierCard
          title="Priced well ABOVE the norm for their size"
          subtitle="Worth understanding — hard access, storm damage, or a strong quote?"
          rows={a.highOutliers}
          fmtDate={fmtDate}
        />
        <OutlierCard
          title="Priced well BELOW the norm for their size"
          subtitle="Worth a look — underpriced quotes, or a data/entry issue?"
          rows={a.lowOutliers}
          fmtDate={fmtDate}
        />
      </section>

      {/* ---------- Method / caveats ---------- */}
      <Card title="How to read this & what's left out" className="mt-8">
        <ul className="list-disc space-y-2 pl-5 text-sm text-fg-2">
          <li>
            <strong>{s.excludedNonTree}</strong> line items billed under the
            tree-removal code were actually <strong>stump, vine, or shrub</strong>{' '}
            jobs (the salesperson picked the wrong pricebook item). They&apos;re
            read from the description and excluded, so only genuine tree
            removals are priced here.
          </li>
          <li>
            <strong>{s.excludedMunicipal}</strong> municipal jobs are excluded
            entirely &mdash; identified by the office&apos;s own &ldquo;Tree
            Work - Municipal&rdquo; business unit, not guessed from the customer
            name. They&apos;re bid on contract / volume terms, not like
            residential work, so leaving them in would distort the pricing.
            Privately-owned golf courses and country clubs are kept as normal
            commercial jobs.
          </li>
          <li>
            Size pricing uses <strong>{s.comparable.toLocaleString()}</strong>{' '}
            single-trunk jobs with a recorded size and a price of $100+. Prices
            under $100 are almost always partial line items, not a tree&apos;s
            full cost, so they&apos;re excluded.
          </li>
          <li>
            Each size band also has a <strong>minimum realistic price</strong>{' '}
            (set with leadership); line items below it are dropped as partials
            (one tree split across rows) or miscoded sizes:{' '}
            {SIZE_BANDS.filter((b) => b.floor > 100)
              .map((b) => `${b.label} ${fmtUsd(b.floor)}`)
              .join(', ')}
            .
          </li>
          <li>
            <strong>{s.multiStem.toLocaleString()}</strong> multi-stem / clump
            removals are held out of the size tables &mdash; their price
            doesn&apos;t track trunk size, so they need their own pricing
            approach (a good next project).
          </li>
          <li>
            Single-driver comparisons (hauling, height, species, salesperson)
            are all held inside the {a.refBandLabel} band so we&apos;re comparing
            similar trees.
          </li>
          <li>
            This is a one-time snapshot of last year&apos;s export. When we want
            it to refresh automatically, the page stays the same &mdash; we just
            change where it reads the data.
          </li>
        </ul>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bt-card">
      <div className="text-xs font-extrabold uppercase tracking-wide text-fg-2">{label}</div>
      <div className="mt-1 font-display text-3xl text-ink sm:text-4xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-fg-3">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bt-card ${className}`}>
      <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function OutlierCard({
  title,
  subtitle,
  rows,
  fmtDate,
}: {
  title: string;
  subtitle: string;
  rows: import('@/lib/cost-analysis').Outlier[];
  fmtDate: (iso: string | null) => string;
}) {
  return (
    <Card title={title}>
      <p className="mb-3 text-sm text-fg-2">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b-2 border-bark/20 text-left text-fg-2">
              <th className="py-1.5 pr-3 font-extrabold uppercase">Size</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Price</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">vs typical</th>
              <th className="py-1.5 pr-3 font-extrabold uppercase">Seller</th>
              <th className="py-1.5 font-extrabold uppercase">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o, i) => (
              <tr key={i} className="border-b border-bark/10">
                <td className="py-1.5 pr-3 font-bold text-ink">{Math.round(o.dbh)}&quot;</td>
                <td className="py-1.5 pr-3 font-bold text-orange">{fmtUsd(o.price)}</td>
                <td className="py-1.5 pr-3 text-fg-2">{o.ratio.toFixed(1)}×</td>
                <td className="py-1.5 pr-3 text-fg-2">{o.seller ?? '—'}</td>
                <td className="py-1.5 text-fg-3">{o.inv ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

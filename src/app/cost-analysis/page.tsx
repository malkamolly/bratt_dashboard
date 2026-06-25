import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { buildCostAnalysis } from '@/lib/cost-analysis';
import { fmtUsd } from '@/lib/format';
import {
  PriceVsSizeScatter,
  MedianBySizeBar,
  SellerComparisonBar,
  SpeciesComparisonBar,
} from './Charts';

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
        from {fmtDate(s.dateFrom)} to {fmtDate(s.dateTo)}.
      </p>

      {/* ---------- Headline numbers ---------- */}
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Removals (line items)" value={s.totalRemovals.toLocaleString()} />
        <Stat label="Total removal revenue" value={fmtUsd(s.totalRevenue)} />
        <Stat label="Median price (all)" value={fmtUsd(s.medianPrice)} />
        <Stat
          label="Comparable single-trunk jobs"
          value={s.comparable.toLocaleString()}
          sub={`of ${s.totalRemovals.toLocaleString()} — used for size pricing`}
        />
      </section>

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
          The seed of a pricing guide. <strong>Typical</strong> is the median
          (middle) price &mdash; half cost more, half less. The{' '}
          <strong>normal range</strong> is the middle 50% of jobs (we ignore the
          cheapest and priciest quarter), so it reflects everyday pricing, not
          freak jobs.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                  <th className="py-2 pr-4 font-extrabold uppercase tracking-wide">Trunk size</th>
                  <th className="py-2 pr-4 font-extrabold uppercase tracking-wide"># jobs</th>
                  <th className="py-2 pr-4 font-extrabold uppercase tracking-wide">Typical</th>
                  <th className="py-2 font-extrabold uppercase tracking-wide">Normal range</th>
                </tr>
              </thead>
              <tbody>
                {a.bands.map((b) => (
                  <tr key={b.label} className="border-b border-bark/10">
                    <td className="py-2 pr-4 font-bold text-ink">{b.label}</td>
                    <td className="py-2 pr-4 text-fg-2">{b.count}</td>
                    <td className="py-2 pr-4 font-bold text-orange">{fmtUsd(b.median)}</td>
                    <td className="py-2 text-fg-2">
                      {fmtUsd(b.p25)} – {fmtUsd(b.p75)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MedianBySizeBar bands={a.bands} />
        </div>
      </Card>

      {/* ---------- Drivers: hauling + height ---------- */}
      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <Card title="Hauling is worth about a third">
          <p className="mb-4 text-sm text-fg-2">
            Same size range ({a.refBandLabel}). Removals where we haul the
            debris away bill noticeably more than &ldquo;no hauling&rdquo; jobs
            &mdash; a clean, defensible line item for the guide.
          </p>
          <div className="flex gap-4">
            {a.hauling.map((h) => (
              <div key={h.label} className="flex-1 rounded-card border-[3px] border-lime p-4 text-center">
                <div className="text-xs font-extrabold uppercase tracking-wide text-fg-2">
                  {h.label}
                </div>
                <div className="mt-1 font-display text-3xl text-orange">{fmtUsd(h.median)}</div>
                <div className="mt-1 text-xs text-fg-3">{h.count} jobs</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Taller trees cost more (same trunk size)">
          <p className="mb-4 text-sm text-fg-2">
            Median price by size <em>and</em> height. Reading across each row,
            price climbs with height &mdash; height is the second real driver
            after trunk size. Blank cells had too few jobs to be reliable.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fg-2">
                  <th className="py-1 pr-3 font-extrabold uppercase tracking-wide">Size</th>
                  {a.heightGrid.heightCols.map((c) => (
                    <th key={c} className="py-1 pr-3 font-extrabold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.heightGrid.rows.map((row) => (
                  <tr key={row.band} className="border-t border-bark/10">
                    <td className="py-1.5 pr-3 font-bold text-ink">{row.band}</td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="py-1.5 pr-3">
                        {c ? (
                          <span className="font-bold text-ink">{fmtUsd(c.median)}</span>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

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
        <SellerComparisonBar data={a.sellers} />
      </Card>

      {/* ---------- Species ---------- */}
      <Card title="Price by species (same size range)" className="mt-8">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          Within {a.refBandLabel}, which species cost the most to remove. Large,
          brittle, or diseased-prone trees (elm, ash) run higher; small
          ornamentals run lower. A candidate modifier for the guide. Only
          species with 8+ jobs shown.
        </p>
        <SpeciesComparisonBar data={a.species} />
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
            Size pricing uses <strong>{s.comparable.toLocaleString()}</strong>{' '}
            single-trunk jobs with a recorded size and a price of $100+. Prices
            under $100 are almost always partial line items, not a tree&apos;s
            full cost, so they&apos;re excluded.
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

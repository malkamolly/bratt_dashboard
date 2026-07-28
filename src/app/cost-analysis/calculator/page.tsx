import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { PRICING_MATRIX } from '@/lib/pricing-matrix';
import { buildMeasureEffect, buildPricingVsActual, type EffectBand } from '@/lib/cost-analysis';
import { PriceCalculator } from '../PriceCalculator';
import { fmtUsd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PricingCalculatorPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeCostAnalysis(user.role)) redirect('/access-denied');

  const effect = buildMeasureEffect();
  const pva = buildPricingVsActual();

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/cost-analysis" className="hover:underline">
          Cost Analysis
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Pricing Calculator
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Pricing Calculator
      </h1>
      <p className="mt-4 max-w-3xl text-fg-2">
        Our suggested going-forward pricing for a tree removal, built from the
        cleanest jobs in{' '}
        <Link href="/cost-analysis" className="font-bold text-orange hover:underline">
          the cost analysis
        </Link>
        . Enter a tree&apos;s three measurements for a price, see the rate card
        behind it, and check how the model stacks up against what we actually
        charged.
      </p>

      <div className="mb-2 mt-6 rounded-md bg-status-warn/40 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-ink">
        Draft — pricing isn&apos;t finalized. A starting point to react to, not a rate sheet.
      </div>

      {/* ---------- The calculator ---------- */}
      <Card title="Price any tree (up to 100″)" className="mt-6">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          Enter DBH (trunk diameter), height, and crown spread. Price = DBH ×
          the base rate for that size, adjusted up or down for a tree that&apos;s
          taller or wider than typical.
        </p>
        <PriceCalculator />
        <div className="mt-5 rounded-card border-2 border-orange/40 bg-orange/5 p-4">
          <div className="text-xs font-extrabold uppercase tracking-wide text-orange">
            Updated Jul 2026 — big trees now priced higher
          </div>
          <p className="mt-1 max-w-2xl text-xs text-fg-2">
            Latest tuning raised pricing for large trees (34″+) so it climbs with
            size, and lifted the cap that was holding back unusual trees. Everyday
            sizes are intentionally unchanged — so if a 20–30″ tree looks the same,
            that&apos;s expected. Enter one of these to see the change:
          </p>
          <table className="mt-3 text-xs">
            <thead>
              <tr className="text-fg-3">
                <th className="py-1 pr-4 text-left font-bold">Example tree</th>
                <th className="py-1 pr-4 text-right font-bold">Was</th>
                <th className="py-1 text-right font-bold">Now</th>
              </tr>
            </thead>
            <tbody className="font-bold text-ink">
              <tr>
                <td className="py-1 pr-4">30″ · 45′ tall · 30′ spread</td>
                <td className="py-1 pr-4 text-right text-fg-3">{fmtUsd(2670)}</td>
                <td className="py-1 text-right text-fg-3">{fmtUsd(2670)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">60″ · 50′ tall · 40′ spread</td>
                <td className="py-1 pr-4 text-right text-fg-3">{fmtUsd(5220)}</td>
                <td className="py-1 text-right text-orange">{fmtUsd(7560)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">72″ · 85′ tall · 85′ spread</td>
                <td className="py-1 pr-4 text-right text-fg-3">{fmtUsd(12096)}</td>
                <td className="py-1 text-right text-orange">{fmtUsd(19656)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- The rate card ---------- */}
      <Card title="The rate card ($/inch)" className="mt-8">
        <p className="mb-2 max-w-3xl rounded-md bg-lime/20 px-3 py-2 text-xs text-fg-2">
          <strong>How to read this:</strong> price = DBH × the base $/inch for that
          size, then adjusted for height and spread. The model runs at{' '}
          <strong>1″ DBH steps</strong> (100 sizes) with 10-ft height and spread
          bands — use the calculator above for any exact tree. This table samples
          every 5″ for a quick read.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="border-b-2 border-bark/20 text-fg-3">
                <th className="px-2 py-1 text-left font-bold">DBH size</th>
                <th className="px-2 py-1 text-right font-bold">Base $/in</th>
                <th className="px-2 py-1 text-right font-bold">Typical height</th>
                <th className="px-2 py-1 text-right font-bold">Typical spread</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_MATRIX.categories
                .filter((_, i) => (i + 1) % 5 === 0)
                .map((cat) => (
                  <tr key={cat.label} className="border-b border-bark/10">
                    <td className="px-2 py-1.5 font-bold text-ink">{cat.label}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-orange">{fmtUsd(cat.base)}</td>
                    <td className="px-2 py-1.5 text-right text-fg-2">
                      {PRICING_MATRIX.heightTiers[cat.refHeight]?.label ?? '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-fg-2">
                      {PRICING_MATRIX.canopyTiers[cat.refCanopy]?.label ?? '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-3xl text-xs text-fg-3">
          <strong>Height &amp; spread:</strong> each 10-ft band above that size&apos;s
          typical adds about 8% of its base rate; each band below subtracts the same.
          The rate cap is currently off while we gather more big-tree data.
        </p>
      </Card>

      {/* ---------- Height & spread effect ---------- */}
      <Card title="How much do height & spread move the price?" className="mt-8 border-orange">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          From{' '}
          <strong>{pva.bands.reduce((s, b) => s + b.count, 0).toLocaleString()}</strong>{' '}
          real removals, with the trunk-size effect removed so height and spread
          show on their own. Each bar is how much more (or less) per inch a tree
          cost versus a <strong>typical</strong> tree of its size. Bottom line:
          both matter, but less than the calculator&apos;s flat{' '}
          <strong>{effect.modelStepPct}%</strong> assumption &mdash; the data says
          about <strong>{effect.heightStepPct}%</strong> per band for height and{' '}
          <strong>{effect.canopyStepPct}%</strong> for spread.
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <EffectChart title="Height" bands={effect.height} />
          <EffectChart title="Spread (canopy width)" bands={effect.canopy} />
        </div>
        <p className="mt-3 text-xs text-fg-3">
          Bars from a paler fill sit on fewer than 10 jobs — read the top bands as
          directional. &ldquo;n&rdquo; is the number of jobs behind each bar.
        </p>
      </Card>

      {/* ---------- New pricing vs actual ---------- */}
      <Card title="New pricing vs. what we charged" className="mt-8">
        <p className="mb-4 max-w-3xl text-sm text-fg-2">
          The calculator&apos;s suggested price against our real median price, by
          size. This is where the tuning shows up: the common sizes (7–33″) track
          within a few percent of what we billed, while the big trees (34″+) are
          now priced meaningfully higher — exactly the change we made.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-bark/20 text-left text-fg-2">
                <th className="py-1.5 pr-4 font-extrabold uppercase">Size</th>
                <th className="py-1.5 pr-4 text-right font-extrabold uppercase">Jobs</th>
                <th className="py-1.5 pr-4 text-right font-extrabold uppercase">We charged (median)</th>
                <th className="py-1.5 pr-4 text-right font-extrabold uppercase">Model now</th>
                <th className="py-1.5 text-right font-extrabold uppercase">Change</th>
              </tr>
            </thead>
            <tbody>
              {pva.bands.map((b) => (
                <tr key={b.label} className="border-b border-bark/10">
                  <td className="py-1.5 pr-4 font-bold text-ink">{b.label}</td>
                  <td className="py-1.5 pr-4 text-right text-fg-3">{b.count}</td>
                  <td className="py-1.5 pr-4 text-right text-fg-2">{fmtUsd(b.medianActual)}</td>
                  <td className="py-1.5 pr-4 text-right font-bold text-ink">{fmtUsd(b.medianModeled)}</td>
                  <td
                    className={`py-1.5 text-right font-bold ${
                      b.deltaPct > 0 ? 'text-orange' : b.deltaPct < 0 ? 'text-fg-3' : 'text-fg-2'
                    }`}
                  >
                    {b.deltaPct >= 0 ? '+' : ''}
                    {b.deltaPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-fg-3">
          &ldquo;Change&rdquo; is how the model&apos;s suggested price compares to the
          middle price we actually charged for that size.
        </p>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function EffectChart({ title, bands }: { title: string; bands: EffectBand[] }) {
  const SCALE = 2; // % point -> width %, capped at the 50% half-width
  return (
    <div>
      <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-fg-2">{title}</div>
      <div className="flex flex-col gap-1.5">
        {bands.map((b) => {
          const w = Math.min(50, Math.abs(b.ratioPct) * SCALE);
          const thin = b.count < 10;
          return (
            <div key={b.label} className="flex items-center gap-2 text-xs">
              <div className="w-16 shrink-0 text-right font-bold text-fg-2">{b.label}</div>
              <div className="relative h-4 flex-1 rounded bg-paper-edge/30">
                <div className="absolute left-1/2 top-0 h-full w-px bg-bark/30" />
                {b.ratioPct >= 0 ? (
                  <div
                    className={`absolute left-1/2 top-0 h-full rounded-r ${thin ? 'bg-orange/40' : 'bg-orange'}`}
                    style={{ width: `${w}%` }}
                  />
                ) : (
                  <div
                    className={`absolute top-0 h-full rounded-l ${thin ? 'bg-bark/30' : 'bg-bark/60'}`}
                    style={{ right: '50%', width: `${w}%` }}
                  />
                )}
              </div>
              <div className="w-10 shrink-0 text-right font-bold text-ink">
                {b.ratioPct >= 0 ? '+' : ''}
                {b.ratioPct}%
              </div>
              <div className="w-10 shrink-0 text-right text-[10px] text-fg-3">n={b.count}</div>
            </div>
          );
        })}
      </div>
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

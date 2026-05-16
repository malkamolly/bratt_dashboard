import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-widest text-brand-primary">
          Bratt Tree Company
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold text-brand-dark">
          PACE Dashboard
        </h1>
        <p className="mt-3 text-brand-dark/70">
          Daily sales and production pace reporting.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          href="/sales"
          className="group rounded-2xl border-2 border-brand-primary/20 bg-white p-8 transition hover:border-brand-primary hover:shadow-lg"
        >
          <h2 className="font-display text-2xl font-semibold text-brand-primary">
            Sales PACE
          </h2>
          <p className="mt-2 text-sm text-brand-dark/70">
            Daily sales by salesperson, MTD totals, monthly goal progress.
          </p>
        </Link>

        <Link
          href="/production"
          className="group rounded-2xl border-2 border-brand-primary/20 bg-white p-8 transition hover:border-brand-primary hover:shadow-lg"
        >
          <h2 className="font-display text-2xl font-semibold text-brand-primary">
            Production PACE
          </h2>
          <p className="mt-2 text-sm text-brand-dark/70">
            Production crews + Plant Healthcare. Jobs, revenue, pacing.
          </p>
        </Link>
      </div>

      <section className="mt-12 rounded-xl border border-dashed border-brand-primary/30 bg-white/50 p-6 text-sm text-brand-dark/60">
        <p className="font-semibold uppercase tracking-wide text-brand-dark/80">
          YTD vs. Annual Target
        </p>
        <p className="mt-1">
          Yearly target placeholder &mdash; set this in the admin panel when ready.
        </p>
      </section>
    </main>
  );
}

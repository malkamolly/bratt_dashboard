export default function SalesDashboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="bt-eyebrow">Dashboard 1</p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink">
        Sales PACE
      </h1>
      <p className="mt-4 max-w-xl text-fg-2">
        Daily sales by salesperson coming next. Calculations live in{' '}
        <code className="font-mono text-sm">src/lib/calculations.ts</code>.
      </p>
    </main>
  );
}

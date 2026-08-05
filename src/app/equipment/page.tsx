// ============================================================================
// /equipment — shared fleet equipment reference
// ============================================================================
// A simple, scannable spec sheet for the whole fleet, readable by BOTH the
// sales team and the field crews. Unlike /hub/* and /crew/* pages, this is a
// top-level route, so middleware does not role-gate it — any signed-in,
// allowlisted user can open it (see src/middleware.ts). Data lives in
// src/lib/fleet-specs.ts.
// ============================================================================

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import {
  NAV_SECTIONS,
  STUMP_GRINDERS,
  FORWARDERS,
  BUCKET_TRUCKS,
  CLAM_TRUCKS,
  AERIAL_LIFT,
  CRANE_DIMENSIONS,
  CRANE_CAPACITY,
  CRANE_RULES,
  CRANE_CHARTS,
  type SpecTable,
} from '@/lib/fleet-specs';

export const dynamic = 'force-dynamic';

/** Cells that should render muted/italic rather than as hard data. */
function isSoft(value: string): boolean {
  return value === 'TBD' || value === '—' || value.includes('(confirm)');
}

function SpecTableBlock({ table }: { table: SpecTable }) {
  return (
    <div className="bt-card !p-5 sm:!p-6">
      <p className="bt-eyebrow">{table.eyebrow}</p>
      <h3 className="mt-1 font-headline text-2xl font-black uppercase tracking-ribbon text-bark-deep">
        {table.title}
      </h3>
      {table.note && <p className="mt-2 text-sm text-fg-2">{table.note}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-bark-deep/25 text-left">
              {table.cols.map((c, i) => (
                <th
                  key={c}
                  className={`py-2 pr-4 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3 ${
                    i === 0 ? '' : 'whitespace-nowrap'
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-paper-edge/60 last:border-0 even:bg-paper/40"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`py-2 pr-4 align-top ${
                      ci === 0
                        ? 'font-headline font-extrabold text-bark-deep'
                        : isSoft(cell)
                          ? 'italic text-fg-3'
                          : 'text-ink'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.tip && (
        <p className="mt-3 border-t border-paper-edge/60 pt-3 text-xs text-fg-2">
          {table.tip}
        </p>
      )}
    </div>
  );
}

function GroupHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-28 font-display text-3xl uppercase tracking-wider text-ink sm:text-4xl"
    >
      {children}
    </h2>
  );
}

export default async function EquipmentPage() {
  const user = await getAllowedUser();
  if (!user) redirect('/login');

  return (
    <main className="bt-page">
      {/* Breadcrumb */}
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Equipment Specs
      </p>

      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Equipment Specs
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        At-a-glance dimensions, weights, and reach for the whole fleet.{' '}
        <span className="font-semibold text-ink">Drive dimensions</span> tell
        you whether it will fit in;{' '}
        <span className="font-semibold text-ink">working dimensions</span> tell
        you what it can do once it is set up.
      </p>

      {/* Quick-jump nav */}
      <nav
        aria-label="Jump to section"
        className="mt-6 flex flex-wrap items-center gap-2"
      >
        {NAV_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border-2 border-bark-deep/15 px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep transition-colors hover:border-orange hover:text-orange"
          >
            {s.label}
          </a>
        ))}
        <Link
          href="/topics/equipment-specs/present"
          className="ml-auto font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange hover:underline"
        >
          Present as slides &rarr;
        </Link>
      </nav>

      {/* ---------- Ground ---------- */}
      <section className="mt-10">
        <GroupHeading id="ground">Ground Equipment</GroupHeading>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpecTableBlock table={STUMP_GRINDERS} />
          <SpecTableBlock table={FORWARDERS} />
        </div>
      </section>

      {/* ---------- Trucks ---------- */}
      <section className="mt-12">
        <GroupHeading id="trucks">Trucks</GroupHeading>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpecTableBlock table={BUCKET_TRUCKS} />
          <SpecTableBlock table={CLAM_TRUCKS} />
        </div>
      </section>

      {/* ---------- Aerial lift ---------- */}
      <section className="mt-12">
        <GroupHeading id="lift">Aerial Lift</GroupHeading>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpecTableBlock table={AERIAL_LIFT} />
        </div>
      </section>

      {/* ---------- Cranes ---------- */}
      <section className="mt-12">
        <GroupHeading id="cranes">Cranes</GroupHeading>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SpecTableBlock table={CRANE_DIMENSIONS} />
          <SpecTableBlock table={CRANE_CAPACITY} />
        </div>

        {/* Operating rules callout */}
        <div className="mt-6 rounded-card border-[3px] border-orange bg-paper p-5 sm:p-6">
          <p className="bt-eyebrow">Cranes · Setup Rules</p>
          <h3 className="mt-1 font-headline text-2xl font-black uppercase tracking-ribbon text-bark-deep">
            Before you set up
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CRANE_RULES.map((r) => (
              <div key={r.label}>
                <p className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-orange-press">
                  {r.label}
                </p>
                <p className="mt-1 text-sm text-fg-1">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Charts ---------- */}
      <section className="mt-12">
        <GroupHeading id="charts">Load &amp; Slope Charts</GroupHeading>
        <p className="mt-2 max-w-2xl text-sm text-fg-2">
          Tap any chart to open it full-size in a new tab.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {CRANE_CHARTS.map((c) => (
            <div key={c.id} className="bt-card !p-5">
              <h3 className="font-headline text-lg font-black uppercase tracking-ribbon text-bark-deep">
                {c.title}
              </h3>
              <a
                href={c.src}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block overflow-hidden rounded-lg border border-paper-edge bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.src}
                  alt={c.title}
                  loading="lazy"
                  className="h-auto w-full"
                />
              </a>
              <p className="mt-3 text-xs text-fg-2">{c.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-12 text-xs text-fg-3">
        One reference for sales and field crews. Works from a phone in the yard.
        See something wrong or missing? Tell Molly and it gets fixed here.
      </p>
    </main>
  );
}

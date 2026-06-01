// ============================================================================
// CDL tracking — /crew/cdl
// ============================================================================
// The CDL pipeline: who's on it and which of the 5 stages they're at. Managers
// can advance people, add crew to the track, or remove them. Everyone else
// sees it read-only. The daily progress page shows a condensed overview that
// links here.
// ============================================================================

import Link from 'next/link';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { listCdlProgress, listEmployees } from '@/lib/crew-data';
import { CDL_STAGES } from '@/lib/cdl';
import { addCdlTrainees } from '@/app/crew/actions';
import { CdlRoster } from '@/components/crew/CdlRoster';

export const dynamic = 'force-dynamic';

export default async function CdlTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; added?: string; removed?: string; error?: string }>;
}) {
  const user = await requireHubAccess('crew');
  const editable = canEditCrew(user.role);
  const sp = await searchParams;

  const [trainees, employees] = await Promise.all([
    listCdlProgress(),
    listEmployees({ activeOnly: true }),
  ]);

  const trackedSlugs = new Set(trainees.map((t) => t.employee_slug));
  const untracked = employees.filter((e) => !trackedSlugs.has(e.slug));

  // Count per stage for the pipeline summary.
  const countByStage = CDL_STAGES.map((_, i) => trainees.filter((t) => t.stage === i + 1).length);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        CDL tracking
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        CDL tracking
      </h1>
      <p className="mt-3 max-w-2xl text-fg-2">
        Commercial Driver&apos;s License pipeline. Everyone on the track sits at
        one of five stages, from independent study to license in hand.
      </p>

      {sp.saved && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">Stage updated.</p>
      )}
      {sp.added && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Added {sp.added} to the track.
        </p>
      )}
      {sp.removed && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Removed from the track.
        </p>
      )}
      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      {/* Pipeline summary */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CDL_STAGES.map((label, i) => (
          <div key={label} className="bt-card !p-4">
            <p className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Stage {i + 1}
            </p>
            <p className="mt-1 font-display text-4xl text-orange">{countByStage[i]}</p>
            <p className="mt-1 text-xs text-fg-2">{label}</p>
          </div>
        ))}
      </section>

      {/* Roster */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-3xl uppercase tracking-wider text-ink">On the track</h2>
          {editable && trainees.length > 1 && (
            <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
              Drag ⠿ to reorder
            </span>
          )}
        </div>
        <CdlRoster
          items={trainees.map((t) => ({ slug: t.employee_slug, name: t.employee_name, stage: t.stage }))}
          editable={editable}
        />
      </section>

      {/* Add to track (managers) */}
      {editable && untracked.length > 0 && (
        <section className="mt-10 bt-card">
          <h2 className="font-headline text-lg font-black uppercase text-bark-deep">
            Add crew to the track
          </h2>
          <p className="mt-1 text-sm text-fg-2">
            Everyone you add starts at Stage 1 (Independent Study). Advance them
            above as they progress.
          </p>
          <form action={addCdlTrainees} className="mt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {untracked.map((e) => (
                <label
                  key={e.slug}
                  className="flex items-center gap-2 rounded-2 border border-paper-edge bg-cream px-3 py-2"
                >
                  <input
                    type="checkbox"
                    name="employee_slug"
                    value={e.slug}
                    className="h-4 w-4 accent-orange"
                  />
                  <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep">
                    {e.name}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4">
              <button type="submit" className="bt-btn bt-btn-primary">
                Add to track
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

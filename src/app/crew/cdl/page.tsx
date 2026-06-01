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
import { CDL_STAGES, cdlStageLabel } from '@/lib/cdl';
import {
  setCdlStage,
  addCdlTrainees,
  removeCdlTrainee,
  moveCdlTrainee,
} from '@/app/crew/actions';

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
        <h2 className="font-display text-3xl uppercase tracking-wider text-ink">On the track</h2>
        {trainees.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">Nobody on the CDL track yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-paper-edge overflow-hidden rounded-card border border-paper-edge bg-paper">
            {trainees.map((t, i) => (
              <li
                key={t.employee_slug}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  {editable && (
                    <span className="flex flex-col">
                      <form action={moveCdlTrainee}>
                        <input type="hidden" name="employee_slug" value={t.employee_slug} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={i === 0}
                          aria-label="Move up"
                          className="font-headline text-xs leading-none text-fg-3 hover:text-orange disabled:opacity-30"
                        >
                          ▲
                        </button>
                      </form>
                      <form action={moveCdlTrainee}>
                        <input type="hidden" name="employee_slug" value={t.employee_slug} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={i === trainees.length - 1}
                          aria-label="Move down"
                          className="font-headline text-xs leading-none text-fg-3 hover:text-orange disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </form>
                    </span>
                  )}
                  <Link
                    href={`/crew/employees/${t.employee_slug}`}
                    className="font-headline text-base font-extrabold text-bark-deep hover:underline"
                  >
                    {t.employee_name}
                  </Link>
                </div>
                {editable ? (
                  <div className="flex items-center gap-2">
                    <form action={setCdlStage} className="flex items-center gap-2">
                      <input type="hidden" name="employee_slug" value={t.employee_slug} />
                      <select
                        name="stage"
                        defaultValue={t.stage}
                        className="rounded-2 border-2 border-paper-edge bg-cream px-2 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep"
                      >
                        {CDL_STAGES.map((label, i) => (
                          <option key={label} value={i + 1}>
                            {i + 1}. {label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="bt-btn bt-btn-dark !text-[10px] !px-2 !py-1">
                        Update
                      </button>
                    </form>
                    <form action={removeCdlTrainee}>
                      <input type="hidden" name="employee_slug" value={t.employee_slug} />
                      <button
                        type="submit"
                        title="Remove from the CDL track"
                        className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-orange-press"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-bark-deep px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream">
                    {t.stage}. {cdlStageLabel(t.stage)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
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

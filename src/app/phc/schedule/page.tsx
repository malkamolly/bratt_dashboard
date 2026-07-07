import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canUsePhcScheduling } from '@/lib/auth';
import { loadActiveView } from '@/lib/phc-data';
import { STATUS_LABELS, nextStatus, type PropertyGroup } from '@/lib/phc-renewals';
import { updateStatus } from '../actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ filter?: string; page?: string; saved?: string; error?: string }>;

const PAGE_SIZE = 50;

const FILTERS: { key: string; label: string; test: (p: PropertyGroup) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'not_started', label: 'Not started', test: (p) => p.status === 'not_started' },
  { key: 'awaiting', label: 'Awaiting reply', test: (p) => p.status === 'text_1' || p.status === 'text_2' },
  { key: 'with_sales', label: 'With sales', test: (p) => p.status === 'with_sales' },
  { key: 'first', label: 'Must go first', test: (p) => p.hasFirst },
  { key: 'needs_info', label: 'Needs info', test: (p) => p.needsInfoCount > 0 },
  { key: 'issues', label: 'Mismatch / dup', test: (p) => p.hasMismatch || p.hasDuplicate },
];

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-paper-edge text-fg-2',
  text_1: 'bg-orange/15 text-orange-press',
  text_2: 'bg-orange/25 text-orange-press',
  with_sales: 'bg-bark-deep/10 text-bark-deep',
  scheduled: 'bg-green/15 text-green-dark',
  declined: 'bg-fg-3/15 text-fg-2',
};

const FLAG_STYLE = (f: string) =>
  f === 'Type mismatch'
    ? 'bg-orange-press/15 text-orange-press'
    : f === 'Not in price book'
      ? 'bg-orange-press/10 text-orange-press'
      : 'bg-orange/15 text-orange-press';

export default async function PhcSchedulePage({ searchParams }: { searchParams: Search }) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canUsePhcScheduling(user.role)) redirect('/access-denied');

  const sp = await searchParams;
  const view = await loadActiveView();

  if (view.batch === null) {
    return (
      <main className="bt-page">
        <p className="bt-eyebrow">
          <Link href="/phc" className="hover:underline">
            PHC Scheduling
          </Link>
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink">
          Call List
        </h1>
        <p className="mt-4 text-fg-2">
          No renewals loaded yet.{' '}
          <Link href="/phc" className="text-orange hover:underline">
            Upload a file
          </Link>{' '}
          to build the call list.
        </p>
      </main>
    );
  }

  const activeFilter = FILTERS.find((f) => f.key === sp.filter) ?? FILTERS[0];
  const filtered = view.properties.filter(activeFilter.test);

  const page = Math.max(1, Number(sp.page) || 1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages);
  const slice = filtered.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);
  const qs = (obj: Record<string, string | number>) =>
    new URLSearchParams({ filter: activeFilter.key, ...obj } as Record<string, string>).toString();

  const batchId = view.batch.id;

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/phc" className="hover:underline">
          PHC Scheduling
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Call List
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink">
        Call List
      </h1>
      <p className="mt-2 text-sm text-fg-2">
        Ordered so the tightest windows and &ldquo;must go first&rdquo; jobs come
        first. Work down the list, set each property&apos;s status, and jot a note.
      </p>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = view.properties.filter(f.test).length;
          const active = f.key === activeFilter.key;
          return (
            <Link
              key={f.key}
              href={`/phc/schedule?filter=${f.key}&page=1`}
              className={`rounded-full px-3 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                active
                  ? 'bg-bark-deep text-white'
                  : 'bg-paper-edge text-fg-2 hover:bg-paper-edge/70'
              }`}
            >
              {f.label} ({count})
            </Link>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-fg-3">
        Showing {slice.length} of {filtered.length} properties
        {totalPages > 1 && ` · page ${clamped} of ${totalPages}`}
      </p>

      <div className="mt-4 space-y-4">
        {slice.map((p) => (
          <section key={p.locationId} className="bt-card">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-headline text-lg font-black uppercase text-bark-deep">
                    {p.customer}
                  </h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon ${STATUS_STYLE[p.status] ?? 'bg-paper-edge text-fg-2'}`}
                  >
                    {STATUS_LABELS[p.status] ?? p.status}
                  </span>
                  {p.hasFirst && (
                    <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                      ★ Must go first
                    </span>
                  )}
                  {p.services.length >= 2 && (
                    <span className="rounded-full bg-bark-deep/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon text-bark-deep">
                      Bundle · {p.services.length}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-fg-3">{p.address}</p>
                <p className="mt-1 font-mono text-[11px] text-fg-3">
                  {p.customerId && <>Customer&nbsp;ID {p.customerId}</>}
                  {p.customerId && p.locationId && <span className="mx-1.5">·</span>}
                  {p.locationId && <>Location&nbsp;ID {p.locationId}</>}
                </p>
              </div>

              {/* Status control — advance the outreach cadence in one click */}
              <form
                action={updateStatus}
                className="flex shrink-0 flex-col gap-2 sm:w-80"
              >
                <input type="hidden" name="batch_id" value={batchId} />
                <input type="hidden" name="location_id" value={p.locationId} />
                <input
                  type="text"
                  name="note"
                  defaultValue={p.note}
                  placeholder="Note (e.g. wants injections only, callback Fri)"
                  className="w-full rounded-2 border-2 border-paper-edge bg-white px-2 py-1.5 font-sans text-sm normal-case focus:border-orange focus:outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {nextStatus(p.status) && (
                    <button
                      name="status"
                      value={nextStatus(p.status)!}
                      className="rounded-2 bg-bark-deep px-3 py-1.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-white hover:bg-bark"
                    >
                      &rarr; {STATUS_LABELS[nextStatus(p.status)!]}
                    </button>
                  )}
                  {p.status !== 'scheduled' && (
                    <button
                      name="status"
                      value="scheduled"
                      className="rounded-2 bg-green px-3 py-1.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-white hover:bg-green-dark"
                    >
                      Scheduled &#10003;
                    </button>
                  )}
                  {p.status !== 'declined' && (
                    <button
                      name="status"
                      value="declined"
                      className="rounded-2 border-2 border-paper-edge px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 hover:border-orange-press hover:text-orange-press"
                    >
                      Declined
                    </button>
                  )}
                  {(p.status === 'scheduled' || p.status === 'declined') && (
                    <button
                      name="status"
                      value="not_started"
                      className="rounded-2 border-2 border-paper-edge px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 hover:border-orange"
                    >
                      Reopen
                    </button>
                  )}
                  <button
                    name="status"
                    value={p.status}
                    className="rounded-2 px-2 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-bark-deep"
                  >
                    Save note
                  </button>
                </div>
              </form>
            </div>

            {/* Services */}
            <ul className="mt-4 divide-y divide-paper-edge border-t border-paper-edge">
              {p.services.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-headline text-sm font-bold text-ink">
                      {s.treatment_name}
                      {s.visits > 1 && (
                        <span className="ml-2 font-normal text-fg-2">
                          · {s.visits} visits
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-2">
                      {[
                        s.num_trees && `${s.num_trees} tree(s)`,
                        s.species,
                        s.tree_location,
                        s.dbh && `DBH ${s.dbh}`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || <span className="italic text-fg-3">no tree details</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.isDuplicate && (
                        <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon text-orange-press">
                          Possible duplicate
                        </span>
                      )}
                      {s.flags.map((f) => (
                        <span
                          key={f}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-ribbon ${FLAG_STYLE(f)}`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    {(s.flags.length > 0 || s.isDuplicate) && s.event_id && (
                      <p className="mt-1 font-mono text-[11px] text-fg-3">
                        Fix in ServiceTitan · Service&nbsp;ID {s.event_id}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-2 bg-paper-edge/60 px-2 py-1 text-xs font-bold text-bark-deep">
                    {s.windowLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          {clamped > 1 ? (
            <Link href={`/phc/schedule?${qs({ page: clamped - 1 })}`} className="bt-btn bt-btn-ghost text-sm">
              &larr; Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-fg-3">
            Page {clamped} of {totalPages}
          </span>
          {clamped < totalPages ? (
            <Link href={`/phc/schedule?${qs({ page: clamped + 1 })}`} className="bt-btn bt-btn-ghost text-sm">
              Next &rarr;
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </main>
  );
}

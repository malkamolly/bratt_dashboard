import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canUsePhcScheduling } from '@/lib/auth';
import { loadActiveView } from '@/lib/phc-data';
import { uploadRenewals } from './actions';

export const dynamic = 'force-dynamic';

type Search = Promise<{ saved?: string; error?: string }>;

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  const color =
    tone === 'bad' ? 'text-orange-press' : tone === 'warn' ? 'text-orange' : 'text-ink';
  return (
    <div className="bt-card">
      <p className={`font-display text-4xl ${color}`}>{value}</p>
      <p className="mt-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-fg-2">
        {label}
      </p>
    </div>
  );
}

export default async function PhcHomePage({ searchParams }: { searchParams: Search }) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canUsePhcScheduling(user.role)) redirect('/access-denied');

  const sp = await searchParams;
  const view = await loadActiveView();

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        PHC Scheduling
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        PHC Scheduling
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Upload the season&apos;s renewals export and the hub organizes it into a
        call list &mdash; grouping treatments by property, flagging services
        missing info, catching duplicates and wrong treatment types, and putting
        the &ldquo;must go first&rdquo; jobs at the top.
      </p>

      {sp.saved && (
        <div className="mt-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm font-bold text-green-dark">
          {decodeURIComponent(sp.saved)}
        </div>
      )}
      {sp.error && (
        <div className="mt-6 rounded-2 border-2 border-orange-press bg-orange/10 px-4 py-3 text-sm font-bold text-orange-press">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Upload */}
      <section className="bt-card mt-8">
        <p className="bt-eyebrow">Step 1</p>
        <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
          Upload renewals export
        </h2>
        <p className="mt-2 text-sm text-fg-2">
          The &ldquo;Location Recurring Service With Invoice Template Details&rdquo;
          export (.xlsx), straight from your service software &mdash; no
          reformatting needed. A new upload replaces the current worklist (call
          statuses reset).
        </p>
        <form
          action={uploadRenewals}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="block w-full text-sm text-fg-2 file:mr-4 file:rounded-2 file:border-0 file:bg-bark-deep file:px-4 file:py-2 file:font-headline file:text-xs file:font-extrabold file:uppercase file:tracking-ribbon file:text-white hover:file:bg-bark"
          />
          <button type="submit" className="bt-btn bt-btn-primary justify-center sm:w-auto">
            Upload
          </button>
        </form>
      </section>

      {/* Current batch summary */}
      {view.batch === null ? (
        <p className="mt-8 text-sm text-fg-3">
          No renewals loaded yet. Upload a file above to get started.
        </p>
      ) : (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="bt-eyebrow">Step 2 — current worklist</p>
              <h2 className="mt-2 font-headline text-2xl font-black uppercase text-bark-deep">
                {view.batch.label}
              </h2>
              <p className="mt-1 text-xs text-fg-3">
                Uploaded {new Date(view.batch.uploaded_at).toLocaleDateString()} by{' '}
                {view.batch.uploaded_by}
              </p>
            </div>
            <Link href="/phc/schedule" className="bt-btn bt-btn-primary">
              Open call list &rarr;
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Services" value={view.summary.totalServices} />
            <Stat label="Properties" value={view.summary.totalProperties} />
            <Stat label="To bundle (2+ services)" value={view.summary.bundles} />
            <Stat label="Not started" value={view.summary.notStarted} />
            <Stat label="Missing info" value={view.summary.needsInfo} tone="warn" />
            <Stat label="Type mismatches" value={view.summary.mismatches} tone="bad" />
            <Stat label="Possible duplicates" value={view.summary.duplicates} tone="warn" />
            <Stat label="Not in price book" value={view.summary.unpriced} tone="warn" />
          </div>
        </section>
      )}
    </main>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAllowedUser, canSeeCostAnalysis } from '@/lib/auth';
import { loadJobById } from '@/lib/removal-entries';
import { fmtUsd } from '@/lib/format';
import { editJob } from '../../actions';

export const dynamic = 'force-dynamic';

const JOBS_PATH = '/cost-analysis/jobs';

export default async function EditJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const user = await getAllowedUser();
  if (!user) redirect('/login');
  if (!canSeeCostAnalysis(user.email)) redirect('/access-denied');

  const { id } = await params;
  const sp = await searchParams;
  const returnTo = (sp.returnTo ?? '').startsWith('/cost-analysis') ? sp.returnTo! : JOBS_PATH;
  const job = await loadJobById(id);

  if (!job) {
    return (
      <main className="bt-page">
        <p className="mt-8 text-fg-2">
          That job couldn&apos;t be found.{' '}
          <Link href={JOBS_PATH} className="font-bold text-orange hover:underline">
            Back to Manage Jobs
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/cost-analysis" className="hover:underline">
          Cost Analysis
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={returnTo} className="hover:underline">
          Manage Jobs
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Edit
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        Edit job — invoice {job.inv ?? '—'}
      </h1>
      {job.updatedAt ? (
        <p className="mt-2 text-sm text-fg-2">
          Last edited{job.reviewedBy ? ` by ${job.reviewedBy}` : ''} on {job.updatedAt.slice(0, 10)}
          {job.adjustedPrice != null && job.originalPrice != null && (
            <> · price adjusted from {fmtUsd(job.originalPrice)} to {fmtUsd(job.adjustedPrice)}</>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-fg-3">Not edited yet — original job as recorded.</p>
      )}

      {sp.error && (
        <div className="mt-6 rounded-card border-2 border-orange bg-orange/10 px-4 py-3 text-sm font-bold text-orange">
          {sp.error}
        </div>
      )}

      <form action={editJob} className="bt-card mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="id" value={job.id} />
        <input type="hidden" name="returnTo" value={returnTo} />

        {/* Price: original is read-only, adjusted is the override. */}
        <div className="flex flex-col text-sm">
          <span className="mb-1 font-bold text-fg-2">Original price (billed)</span>
          <div className="rounded-card border-2 border-bark/10 bg-paper-edge/30 px-3 py-2 font-bold text-ink">
            {job.originalPrice != null ? fmtUsd(job.originalPrice) : '—'}
          </div>
          <span className="mt-1 text-[11px] text-fg-3">Kept on record — never changes.</span>
        </div>
        <Field
          label="Adjusted price ($)"
          name="adjusted_price"
          type="number"
          step="0.01"
          defaultValue={job.adjustedPrice ?? ''}
          placeholder="leave blank = use original"
        />
        <div className="hidden lg:block" />

        <Field label="DBH — trunk diameter (in)" name="dbh" type="number" step="0.1" defaultValue={job.dbh ?? ''} />
        <Field label="Height (ft)" name="height" type="number" step="0.1" defaultValue={job.height ?? ''} />
        <Field label="Crown spread (ft)" name="crown" type="number" step="0.1" defaultValue={job.crown ?? ''} />
        <Field label="Species" name="species" type="text" defaultValue={job.species ?? ''} />
        <Field label="Sold by (First + last initial)" name="seller" type="text" defaultValue={job.seller ?? ''} />
        <Field label="Date completed" name="date" type="date" defaultValue={job.date ?? ''} />
        <Field label="Trunks (1 unless a clump)" name="stems" type="number" step="1" defaultValue={job.stems ?? 1} />

        <label className="flex flex-col text-sm">
          <span className="mb-1 font-bold text-fg-2">Hauling?</span>
          <select
            name="haul"
            defaultValue={job.haul ? 'yes' : 'no'}
            className="rounded-card border-2 border-bark/20 bg-white px-3 py-2 text-ink"
          >
            <option value="yes">With hauling</option>
            <option value="no">No hauling</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="muni" defaultChecked={job.muni} className="h-4 w-4" />
          <span className="font-bold text-fg-2">Municipal (exclude from pricing)</span>
        </label>

        <label className="flex flex-col text-sm sm:col-span-2 lg:col-span-3">
          <span className="mb-1 font-bold text-fg-2">Note (optional)</span>
          <input
            type="text"
            name="note"
            defaultValue={job.note ?? ''}
            placeholder="e.g. why the price was adjusted"
            className="rounded-card border-2 border-bark/20 bg-white px-3 py-2 text-ink"
          />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            className="rounded-card border-[3px] border-orange bg-orange px-6 py-2.5 font-headline text-sm font-black uppercase tracking-wide text-white transition-colors hover:bg-bark-deep"
          >
            Save changes
          </button>
          <Link href={returnTo} className="text-sm font-bold text-fg-2 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  type,
  step,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  step?: string;
  defaultValue?: string | number;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-bold text-fg-2">{label}</span>
      <input
        type={type}
        name={name}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded-card border-2 border-bark/20 bg-white px-3 py-2 text-ink placeholder:text-fg-3/60"
      />
    </label>
  );
}

// ============================================================================
// Practical test-out signoff — /crew/modules/[slug]/practical/[assignmentId]
// ============================================================================
// Manager-only form. Lists every practical-test-out item for the module,
// shows existing signoffs as locked rows, and lets the trainer tick + sign
// new items. One initials field at the top is applied to every checked
// row in this submission.
// ============================================================================

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import {
  getAssignment,
  getTrainingModule,
  listPracticalItems,
  listPracticalSignoffsForAssignment,
} from '@/lib/crew-data';
import {
  signOffPracticalItems,
  undoPracticalSignoff,
} from '@/app/crew/actions';

export const dynamic = 'force-dynamic';

export default async function PracticalSignoffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; assignmentId: string }>;
  searchParams: Promise<{ saved?: string; undone?: string; error?: string }>;
}) {
  const user = await requireHubAccess('crew');
  if (!canEditCrew(user.role)) redirect('/access-denied');
  const { slug, assignmentId } = await params;
  const sp = await searchParams;

  const [mod, assignment, items, signoffs] = await Promise.all([
    getTrainingModule(slug),
    getAssignment(assignmentId),
    listPracticalItems(slug),
    listPracticalSignoffsForAssignment(assignmentId),
  ]);
  if (!mod || !assignment || assignment.module_slug !== slug) notFound();

  const signedById = new Map(signoffs.map((s) => [s.item_id, s]));
  const signedCount = signoffs.length;
  const total = items.length;
  const allSigned = total > 0 && signedCount === total;
  const writtenPassed = assignment.latest_attempt?.passed === true;
  const certIssued = !!assignment.latest_attempt?.certificate_number;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/modules" className="hover:underline">
          Training modules
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href={`/crew/modules/${slug}`} className="hover:underline">
          {mod.name}
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Practical test-out
      </p>

      <header className="mt-3">
        <h1 className="font-display text-5xl uppercase tracking-wider text-ink">
          Practical test-out
        </h1>
        <p className="mt-2 max-w-2xl text-fg-2">
          Trainer for <strong>{assignment.employee_name}</strong> on{' '}
          <strong>{mod.name}</strong>. Tick each task you&apos;ve witnessed,
          type your initials at the top, and click Sign off.
        </p>
        <p className="mt-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          {signedCount} of {total} items signed
          {' · '}
          Written test: {writtenPassed ? 'Passed' : 'Not yet passed'}
          {' · '}
          Certificate: {certIssued ? assignment.latest_attempt?.certificate_number : 'Pending'}
        </p>
      </header>

      {sp.saved && (
        <p className="mt-5 rounded-2 bg-green/10 px-3 py-2 text-sm text-green-dark">
          Signed off {sp.saved} item{Number(sp.saved) === 1 ? '' : 's'}.
          {allSigned && writtenPassed && certIssued
            ? ' Certificate issued — see the module page.'
            : allSigned && writtenPassed
              ? ' Practical complete — certificate will issue automatically.'
              : ''}
        </p>
      )}
      {sp.undone && (
        <p className="mt-5 rounded-2 bg-paper-edge px-3 py-2 text-sm text-fg-2">
          Removed the signoff.
        </p>
      )}
      {sp.error && (
        <p className="mt-5 rounded-2 bg-orange/10 px-3 py-2 text-sm text-orange-press">
          {decodeURIComponent(sp.error)}
        </p>
      )}

      {total === 0 ? (
        <section className="mt-8 bt-card">
          <p className="text-fg-2">
            This module doesn&apos;t have any practical test-out items defined.
          </p>
        </section>
      ) : (
        <form action={signOffPracticalItems} className="mt-8 space-y-6">
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="module_slug" value={slug} />

          <div className="bt-card">
            <label
              htmlFor="initials"
              className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3"
            >
              Your initials (applied to every item you sign in this submission)
            </label>
            <input
              id="initials"
              name="initials"
              type="text"
              maxLength={6}
              placeholder="e.g. ML"
              required
              autoComplete="off"
              className="mt-2 block w-full max-w-[180px] rounded-2 border-2 border-paper-edge bg-cream px-3 py-2 font-headline text-base font-extrabold uppercase tracking-wider text-bark-deep focus:border-orange focus:outline-none"
            />
            <p className="mt-2 text-xs text-fg-3">
              Signing as <strong>{user.email}</strong>.
            </p>
          </div>

          <div className="overflow-hidden rounded-card border border-paper-edge bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-bone">
                <tr>
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Area
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Task
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Pass
                  </th>
                  <th className="px-3 py-2 text-left font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
                    Initials
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const signed = signedById.get(item.id);
                  return (
                    <tr key={item.id} className="border-t border-paper-edge/60">
                      <td className="px-3 py-2 align-top font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-bark-deep">
                        {item.area}
                      </td>
                      <td className="px-3 py-2 align-top text-fg-1">{item.task}</td>
                      <td className="px-3 py-2 align-top">
                        {signed ? (
                          <span className="inline-flex items-center rounded-full bg-green-dark px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-white">
                            Passed
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            name={`pass_${item.id}`}
                            className="h-5 w-5 accent-orange"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {signed ? (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-headline text-sm font-extrabold uppercase tracking-wider text-bark-deep">
                              {signed.trainer_initials}
                            </span>
                            <span className="text-fg-3">
                              {format(parseISO(signed.signed_at), 'MMM d, yyyy')}
                            </span>
                            <form action={undoPracticalSignoff}>
                              <input type="hidden" name="signoff_id" value={signed.id} />
                              <input type="hidden" name="module_slug" value={slug} />
                              <input type="hidden" name="assignment_id" value={assignmentId} />
                              <button
                                type="submit"
                                className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-orange-press"
                                title="Remove this signoff"
                              >
                                Undo
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="bt-btn bt-btn-primary" disabled={allSigned}>
              Sign off checked items
            </button>
            <Link href={`/crew/modules/${slug}`} className="bt-btn bt-btn-ghost">
              Back to module
            </Link>
            {allSigned && (
              <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-green-dark">
                All items signed off
              </span>
            )}
          </div>
        </form>
      )}
    </main>
  );
}

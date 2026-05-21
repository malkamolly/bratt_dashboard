// ============================================================================
// Plan detail — /crew/plans/[slug]
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getPlan } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireHubAccess('crew');
  const { slug } = await params;
  const editable = canEditCrew(user.role);
  const plan = await getPlan(slug);
  if (!plan) notFound();

  const statusColors =
    plan.status === 'active'
      ? 'bg-green text-ink'
      : plan.status === 'completed'
        ? 'bg-green-dark text-white'
        : 'bg-paper-edge text-fg-2';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/plans" className="hover:underline">
          Plans
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        {plan.skill_name}
      </p>

      <header className="mt-3">
        <h1 className="font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
          {plan.skill_name}
        </h1>
        <p className="mt-2 text-lg text-fg-2">
          <Link
            href={`/crew/employees/${plan.employee_slug}`}
            className="font-headline font-extrabold text-bark-deep hover:underline"
          >
            {plan.employee_name}
          </Link>{' '}
          — L{plan.current_level} → L{plan.target_level}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${statusColors}`}
          >
            {plan.status}
          </span>
          <span className="text-fg-2">
            Opened {format(parseISO(plan.opened), 'MMM d, yyyy')}
          </span>
          {plan.target_date && (
            <span className="text-fg-2">
              · Target {format(parseISO(plan.target_date), 'MMM d, yyyy')}
            </span>
          )}
          {plan.closed && (
            <span className="text-fg-2">
              · Closed {format(parseISO(plan.closed), 'MMM d, yyyy')}
            </span>
          )}
        </div>

        {editable && (
          <div className="mt-4">
            <Link href={`/admin/crew/plans/${plan.slug}`} className="bt-btn bt-btn-dark text-xs">
              Edit plan &rarr;
            </Link>
          </div>
        )}
      </header>

      {plan.goal && (
        <section className="mt-8 bt-card">
          <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-3">
            Goal
          </h2>
          <div className="prose prose-sm mt-2 max-w-none text-fg-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.goal}</ReactMarkdown>
          </div>
        </section>
      )}

      {plan.plan_body && (
        <section className="mt-6 bt-card">
          <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-3">
            Plan
          </h2>
          <div className="prose prose-sm mt-2 max-w-none text-fg-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.plan_body}</ReactMarkdown>
          </div>
        </section>
      )}

      <section className="mt-6 bt-card">
        <h2 className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-fg-3">
          Updates
        </h2>
        {plan.updates.length === 0 ? (
          <p className="mt-2 text-sm text-fg-3">No updates yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {plan.updates.map((u) => (
              <li key={u.id} className="flex gap-3">
                <span className="shrink-0 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-3 mt-0.5">
                  {format(parseISO(u.occurred_on), 'MMM d, yyyy')}
                </span>
                <span className="text-ink">{u.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

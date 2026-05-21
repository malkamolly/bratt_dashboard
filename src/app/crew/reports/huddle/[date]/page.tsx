// ============================================================================
// Daily huddle by date — /crew/reports/huddle/[date]
// ============================================================================

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireHubAccess, canEditCrew } from '@/lib/auth';
import { getHuddle } from '@/lib/crew-data';

export const dynamic = 'force-dynamic';

export default async function HuddleDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const user = await requireHubAccess('crew');
  const { date } = await params;
  const editable = canEditCrew(user.role);
  const huddle = await getHuddle(date);
  if (!huddle) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/crew" className="hover:underline">
          Field Crew Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/crew/reports" className="hover:underline">
          Reports
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Huddle
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
          {format(parseISO(huddle.date), 'EEEE, MMM d, yyyy')}
        </h1>
        {editable && (
          <Link href={`/admin/crew/huddles/${huddle.date}`} className="bt-btn bt-btn-dark text-xs">
            Edit &rarr;
          </Link>
        )}
      </div>

      <article className="prose prose-lg mt-8 max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{huddle.body}</ReactMarkdown>
      </article>
    </main>
  );
}

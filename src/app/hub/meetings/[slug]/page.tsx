import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { requireHubAccess } from '@/lib/auth';
import { HubSubNav } from '@/components/HubSubNav';
import { getMeeting, tagSlug } from '@/lib/hub-content';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function MeetingDetailPage({ params }: { params: Params }) {
  await requireHubAccess('hub');
  const { slug } = await params;
  const m = getMeeting(slug);
  if (!m) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="bt-eyebrow">
        <Link href="/hub" className="hover:underline">
          Sales Arborist Hub
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        <Link href="/hub/meetings" className="hover:underline">
          Meetings
        </Link>
      </p>

      <div className="mt-8">
        <HubSubNav active="/hub/meetings" />
      </div>

      <p className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-orange">
        {formatDate(m.date)}
      </p>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wider text-ink sm:text-5xl">
        {m.title.replace(/&mdash;/g, '—')}
      </h1>

      {m.educational && (
        <section className="mt-10">
          <p className="bt-eyebrow">Educational Topic</p>
          <h2 className="mt-2 font-headline text-3xl font-black uppercase text-bark-deep">
            {m.educational.title}
          </h2>
          {m.educational.tags && m.educational.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {m.educational.tags.map((t) => (
                <Link
                  key={t}
                  href={`/hub/library?tag=${tagSlug(t)}`}
                  className="rounded-full bg-paper-edge px-3 py-1 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-bark-deep hover:bg-lime/60"
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
          <div className="prose prose-bratt mt-6 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {m.educational.body}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {m.housekeeping && (
        <section className="mt-10">
          <p className="bt-eyebrow">Housekeeping</p>
          <div className="prose prose-bratt mt-3 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {m.housekeeping}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {m.operations && (
        <section className="mt-10">
          <p className="bt-eyebrow">Operations</p>
          <div className="prose prose-bratt mt-3 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {m.operations}
            </ReactMarkdown>
          </div>
        </section>
      )}
    </main>
  );
}

import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getConnection } from '@/lib/slack';
import { getDisplayBoard } from './actions';
import { TriageBoard } from './TriageBoard';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  not_configured:
    'Slack isn’t set up on the server yet (missing app credentials). See the setup notes.',
  denied: 'You cancelled the Slack connection. No changes were made.',
  state_mismatch:
    'That sign-in link expired or didn’t match. Please try connecting again.',
  exchange_failed:
    'Slack wouldn’t complete the connection. Please try again in a moment.',
};

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await requireOwner();
  const params = await searchParams;

  const connection = await getConnection(user.email);
  const board = connection ? await getDisplayBoard(user.email) : null;

  return (
    <main className="bt-page">
      <p className="bt-eyebrow">
        <Link href="/" className="hover:underline">
          Bratt Tree
        </Link>
        <span className="mx-2 text-fg-3">/</span>
        Slack Tags
      </p>
      <h1 className="mt-2 font-display text-5xl uppercase tracking-wider text-ink sm:text-6xl">
        Slack Tags
      </h1>
      <p className="mt-4 max-w-2xl text-fg-2">
        Every message you’ve been tagged in, sorted by what actually needs you.
        The two at the top are the point &mdash; the rest is here so you can stop
        worrying about it.
      </p>

      {params.error && (
        <p className="mt-6 rounded-2 border-2 border-orange bg-orange/5 px-4 py-3 text-sm text-fg-1">
          {ERROR_MESSAGES[params.error] ??
            'Something went wrong connecting to Slack. Please try again.'}
        </p>
      )}
      {params.connected && (
        <p className="mt-6 rounded-2 border-2 border-green bg-green/10 px-4 py-3 text-sm text-fg-1">
          Slack connected. Loading your tags…
        </p>
      )}

      {!connection ? (
        <section className="mt-10 rounded-card border-[3px] border-paper-edge bg-white p-8 text-center">
          <h2 className="font-headline text-2xl font-black uppercase text-bark-deep">
            Connect your Slack
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-fg-2">
            This reads your tagged messages <strong>as you</strong> &mdash; only
            what you can already see, nothing more, and read-only. Nobody else’s
            messages are ever touched.
          </p>
          <div className="mt-6 flex justify-center">
            {/* Plain link — the connect route is a GET redirect to Slack. */}
            <a href="/api/slack/connect" className="bt-btn bt-btn-primary">
              Connect Slack
            </a>
          </div>
        </section>
      ) : (
        <TriageBoard initialBoard={board} />
      )}
    </main>
  );
}

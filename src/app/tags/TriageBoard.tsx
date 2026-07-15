'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, ExternalLink, Slack } from 'lucide-react';
import { refreshBoard, disconnectSlack } from './actions';
import type { Bucket, TriageBoard as Board, TriageCard } from '@/lib/slack-triage';

// Refresh cadence. On mount we refresh if the cache is older than this; while
// the tab stays open we quietly refresh on this interval too. Slack search is
// rate-limited, so we keep this relaxed rather than chatty.
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const BACKGROUND_MS = 5 * 60 * 1000; // 5 minutes

type Section = {
  key: Bucket;
  title: string;
  blurb: string;
  tone: 'danger' | 'neutral' | 'quiet';
  collapsedByDefault?: boolean;
};

const SECTIONS: Section[] = [
  {
    key: 'needs_reply',
    title: 'Needs a reply',
    blurb: 'A person asked you something and you haven’t answered yet.',
    tone: 'danger',
  },
  {
    key: 'waiting',
    title: 'Waiting on someone else',
    blurb: 'You replied — the ball is in their court now.',
    tone: 'neutral',
  },
  {
    key: 'handled',
    title: 'Handled',
    blurb: 'Answered and closed out. Here for peace of mind.',
    tone: 'quiet',
    collapsedByDefault: true,
  },
  {
    key: 'fyi',
    title: 'FYI / bot cc’s',
    blurb: 'Automated tags and broadcasts. Rarely need you.',
    tone: 'quiet',
    collapsedByDefault: true,
  },
];

export function TriageBoard({ initialBoard }: { initialBoard: Board | null }) {
  const [board, setBoard] = useState<Board | null>(initialBoard);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const inFlight = useRef(false);

  const doRefresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const fresh = await refreshBoard();
        setBoard(fresh);
      } finally {
        inFlight.current = false;
      }
    });
  }, []);

  // On mount: refresh if we have no board or it's stale. Also mark mounted so
  // relative timestamps only render client-side (avoids hydration mismatch).
  useEffect(() => {
    setMounted(true);
    const stale = !board || Date.now() - board.fetchedAt > STALE_MS;
    if (stale) doRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quiet background refresh while the tab is open.
  useEffect(() => {
    const id = setInterval(doRefresh, BACKGROUND_MS);
    return () => clearInterval(id);
  }, [doRefresh]);

  const needsReauth = board?.error === 'reauth';

  return (
    <div className="mt-8">
      {/* Toolbar: freshness + manual refresh --------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-paper-edge pb-3">
        <p className="text-xs text-fg-3">
          {mounted && board?.fetchedAt
            ? `Updated ${formatDistanceToNow(board.fetchedAt, { addSuffix: true })}`
            : 'Loading…'}
          {board?.truncatedAt
            ? ` · showing your ${board.truncatedAt} most recent tags`
            : ''}
        </p>
        <button
          type="button"
          onClick={doRefresh}
          disabled={pending}
          className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-ribbon text-orange hover:text-orange-press disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
          {pending ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {needsReauth && (
        <p className="mt-6 rounded-2 border-2 border-orange bg-orange/5 px-4 py-3 text-sm text-fg-1">
          Your Slack connection expired.{' '}
          <a href="/api/slack/connect" className="font-bold text-orange underline">
            Reconnect
          </a>{' '}
          to keep seeing your tags.
        </p>
      )}
      {board?.error && !needsReauth && (
        <p className="mt-6 rounded-2 border-2 border-orange bg-orange/5 px-4 py-3 text-sm text-fg-1">
          Couldn’t reach Slack just now ({board.error}). It’ll retry
          automatically, or hit Refresh.
        </p>
      )}

      {/* The three buckets --------------------------------------------------- */}
      <div className="mt-6 space-y-8">
        {SECTIONS.map((section) => (
          <BucketSection
            key={section.key}
            section={section}
            cards={board?.[section.key] ?? []}
            mounted={mounted}
          />
        ))}
      </div>

      {/* Disconnect, tucked at the bottom ------------------------------------ */}
      <details className="mt-12 border-t-2 border-paper-edge pt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-fg-3 hover:text-orange">
          Slack connection
        </summary>
        <div className="mt-3 flex items-center gap-3 text-sm text-fg-2">
          <Slack className="h-4 w-4 text-fg-3" />
          <span>Connected and read-only.</span>
          <form action={disconnectSlack}>
            <button
              type="submit"
              className="bt-btn bt-btn-ghost text-xs text-red-600"
            >
              Disconnect
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One bucket + its cards
// ---------------------------------------------------------------------------

function BucketSection({
  section,
  cards,
  mounted,
}: {
  section: Section;
  cards: TriageCard[];
  mounted: boolean;
}) {
  const count = cards.length;

  const header = (
    <div className="flex items-baseline gap-3">
      <h2
        className={`font-headline text-xl font-black uppercase ${
          section.tone === 'danger' ? 'text-orange-press' : 'text-bark-deep'
        }`}
      >
        {section.title}
      </h2>
      <span className="text-sm font-bold text-fg-3">{count}</span>
    </div>
  );

  // Quiet buckets collapse behind a disclosure so they don't shout.
  if (section.collapsedByDefault) {
    return (
      <details className="group" open={false}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between">
            {header}
            <span className="text-xs text-fg-3 group-open:hidden">Show</span>
            <span className="hidden text-xs text-fg-3 group-open:inline">Hide</span>
          </div>
          <p className="mt-1 text-xs text-fg-3">{section.blurb}</p>
        </summary>
        <CardList cards={cards} tone={section.tone} mounted={mounted} />
      </details>
    );
  }

  return (
    <section
      className={
        section.tone === 'danger'
          ? 'rounded-card border-[3px] border-orange bg-orange/5 p-5'
          : ''
      }
    >
      {header}
      <p className="mt-1 text-xs text-fg-3">{section.blurb}</p>
      <CardList cards={cards} tone={section.tone} mounted={mounted} />
    </section>
  );
}

function CardList({
  cards,
  tone,
  mounted,
}: {
  cards: TriageCard[];
  tone: Section['tone'];
  mounted: boolean;
}) {
  if (cards.length === 0) {
    return (
      <p className="mt-3 text-sm text-fg-3">
        {tone === 'danger' ? 'Nothing needs you right now. ✿' : 'Nothing here.'}
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-3">
      {cards.map((card) => (
        <Card key={card.id} card={card} mounted={mounted} />
      ))}
    </ul>
  );
}

function Card({ card, mounted }: { card: TriageCard; mounted: boolean }) {
  return (
    <li className="rounded-2 border-2 border-paper-edge bg-white p-4">
      <div className="flex items-start gap-3">
        {/* Initials avatar */}
        <div
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-black ${
            card.isBot ? 'bg-paper-edge text-fg-3' : 'bg-bark text-cream'
          }`}
          aria-hidden
        >
          {card.authorInitials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-bold text-ink">{card.authorName}</span>
            {card.isBot && (
              <span className="rounded-1 bg-paper-edge px-1.5 py-0.5 text-[10px] font-bold uppercase text-fg-3">
                bot
              </span>
            )}
            <span className="text-fg-3">·</span>
            <span className="text-fg-3">{card.channelName}</span>
            <span className="text-fg-3">·</span>
            <span className="text-fg-3">
              {mounted
                ? formatDistanceToNow(card.timestampMs, { addSuffix: true })
                : ''}
            </span>
          </div>

          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-1">
            {card.text}
          </p>

          {/* Waiting cards: remind the user of their own last line. */}
          {card.userLastLine && (
            <p className="mt-2 border-l-2 border-paper-edge pl-3 text-xs italic text-fg-3">
              You said: “{card.userLastLine}”
            </p>
          )}

          {card.permalink && (
            <a
              href={card.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-orange hover:text-orange-press"
            >
              Open in Slack <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

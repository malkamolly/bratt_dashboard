'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  RefreshCw,
  ExternalLink,
  Slack,
  Check,
  Flag,
  CornerUpLeft,
  Undo2,
} from 'lucide-react';
import {
  refreshBoard,
  disconnectSlack,
  setMessageAction,
  clearMessageAction,
  sendReply,
} from './actions';
import type { Bucket, TriageBoard as Board, TriageCard } from '@/lib/slack-triage';

// Refresh cadence. On mount we refresh if the cache is older than this; while
// the tab stays open we quietly refresh on this interval too. Slack search is
// rate-limited, so we keep this relaxed rather than chatty.
const STALE_MS = 3 * 60 * 1000; // 3 minutes
const BACKGROUND_MS = 10 * 60 * 1000; // 10 minutes — gentle on Slack's search rate limit

type Tab = string; // 'all', a bucket key, or `group:<name>`

type Section = {
  key: string;
  title: string;
  tabLabel: string;
  blurb: string;
  tone: 'danger' | 'neutral' | 'accent' | 'quiet';
  collapsedInAll?: boolean; // collapse behind a disclosure in the "All" view
  cards: TriageCard[];
};

// The personal buckets — the main board. Usergroups are NOT here; they live in
// their own chip row (see buildGroupSections) so they don't clutter this flow.
function buildPersonalSections(board: Board | null): Section[] {
  return [
    {
      key: 'needs_reply',
      title: 'Needs a reply',
      tabLabel: 'Needs reply',
      blurb: 'A person asked you something and you haven’t answered yet.',
      tone: 'danger',
      cards: board?.needs_reply ?? [],
    },
    {
      key: 'waiting',
      title: 'Waiting on someone else',
      tabLabel: 'Waiting',
      blurb: 'You replied — the ball is in their court now.',
      tone: 'neutral',
      cards: board?.waiting ?? [],
    },
    {
      key: 'followup',
      title: 'Follow-up list',
      tabLabel: 'Follow-up',
      blurb: 'Things you flagged to come back to.',
      tone: 'accent',
      cards: board?.followup ?? [],
    },
    {
      key: 'handled',
      title: 'Handled',
      tabLabel: 'Handled',
      blurb: 'Answered or cleared. Here for peace of mind.',
      tone: 'quiet',
      collapsedInAll: true,
      cards: board?.handled ?? [],
    },
    {
      key: 'fyi',
      title: 'FYI / bot cc’s',
      tabLabel: 'FYI',
      blurb: 'Automated tags and broadcasts. Rarely need you.',
      tone: 'quiet',
      collapsedInAll: true,
      cards: board?.fyi ?? [],
    },
  ];
}

// The usergroup sections (@phc, @scheduling, @officeteam). Dynamic — their
// number and names come from the board.
function buildGroupSections(board: Board | null): Section[] {
  return (board?.groups ?? []).map((g) => ({
    key: `group:${g.name}`,
    title: g.name,
    tabLabel: g.name,
    blurb: `Messages tagging @${g.name.toLowerCase()}.`,
    tone: 'accent',
    cards: g.cards,
  }));
}

export function TriageBoard({ initialBoard }: { initialBoard: Board | null }) {
  const [board, setBoard] = useState<Board | null>(initialBoard);
  const [tab, setTab] = useState<Tab>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const inFlight = useRef(false);
  // Keep the current week available to callbacks/intervals without re-creating
  // them each render.
  const offsetRef = useRef(0);
  offsetRef.current = weekOffset;

  const doRefresh = useCallback((offset?: number) => {
    const off = offset ?? offsetRef.current;
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        setBoard(await refreshBoard(off));
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
    if (stale) doRefresh(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => doRefresh(), BACKGROUND_MS);
    return () => clearInterval(id);
  }, [doRefresh]);

  function switchWeek(offset: number) {
    if (offset === offsetRef.current) return;
    setWeekOffset(offset);
    offsetRef.current = offset;
    doRefresh(offset);
  }

  // --- Card actions -------------------------------------------------------
  const onAction = useCallback(
    (id: string, action: 'handled' | 'followup', card: TriageCard) => {
      startTransition(async () =>
        setBoard(await setMessageAction(id, action, offsetRef.current, card)),
      );
    },
    [],
  );

  const onUndo = useCallback((id: string) => {
    startTransition(async () => setBoard(await clearMessageAction(id, offsetRef.current)));
  }, []);

  // After a reply posts, move the card to "Waiting" right away (Slack search
  // can lag a minute); the next real refresh reconciles.
  const onReplied = useCallback((id: string, text: string) => {
    setBoard((prev) => (prev ? moveToWaiting(prev, id, text) : prev));
  }, []);

  const needsReauth = board?.error === 'reauth';
  const personalSections = buildPersonalSections(board);
  const groupSections = buildGroupSections(board);
  // "All" shows the personal buckets only; a bucket tab shows that bucket; a
  // group chip shows that one group.
  const visibleSections =
    tab === 'all'
      ? personalSections
      : [...personalSections, ...groupSections].filter((s) => s.key === tab);
  const tabs = [
    { key: 'all', label: 'All', count: undefined as number | undefined },
    ...personalSections.map((s) => ({ key: s.key, label: s.tabLabel, count: s.cards.length })),
  ];

  return (
    <div className="mt-8">
      {/* Toolbar: week toggle + manual refresh ------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {[
            { off: 0, label: 'This week' },
            { off: -1, label: 'Last week' },
          ].map((w) => (
            <button
              key={w.off}
              type="button"
              onClick={() => switchWeek(w.off)}
              className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                weekOffset === w.off
                  ? 'bg-orange text-white'
                  : 'bg-white text-fg-2 ring-1 ring-inset ring-paper-edge hover:text-orange'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => doRefresh()}
          disabled={pending}
          className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-ribbon text-orange hover:text-orange-press disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
          {pending ? 'Working' : 'Refresh'}
        </button>
      </div>
      <p className="mt-1 text-xs text-fg-3">
        {board?.weekLabel && (
          <span className="font-bold text-fg-2">Showing {board.weekLabel}</span>
        )}
        {mounted && board?.fetchedAt
          ? ` · updated ${formatDistanceToNow(board.fetchedAt, { addSuffix: true })}`
          : ' · loading…'}
        {board?.truncatedAt ? ` · capped at ${board.truncatedAt} this week` : ''}
        {' · follow-up carries over every week'}
      </p>

      {/* Usergroups — their own row, between the week toggle and the tabs ----- */}
      {groupSections.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2 border-2 border-paper-edge bg-white/60 px-3 py-2">
          <span className="text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            Groups
          </span>
          {groupSections.map((g) => {
            const active = tab === g.key;
            return (
              <button
                key={g.key}
                type="button"
                // Click an active group again to return to the main board.
                onClick={() => setTab(active ? 'all' : g.key)}
                className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                  active
                    ? 'bg-green-dark text-white'
                    : 'bg-white text-fg-2 ring-1 ring-inset ring-lime hover:text-green-dark'
                }`}
              >
                {g.tabLabel}
                <span className="ml-1.5 opacity-70">{g.cards.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter tabs — jump between sections --------------------------------- */}
      <div className="sticky top-0 z-10 mt-3 flex flex-wrap gap-2 border-b-2 border-paper-edge bg-cream/95 py-3 backdrop-blur">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
                active
                  ? 'bg-bark text-cream'
                  : 'bg-white text-fg-2 ring-1 ring-inset ring-paper-edge hover:text-orange'
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1.5 opacity-70">{t.count}</span>}
            </button>
          );
        })}
      </div>

      {needsReauth && (
        <p className="mt-6 rounded-2 border-2 border-orange bg-orange/5 px-4 py-3 text-sm text-fg-1">
          Your Slack connection needs refreshing.{' '}
          <a href="/api/slack/connect" className="font-bold text-orange underline">
            Reconnect
          </a>{' '}
          to keep seeing your tags (and to enable replies).
        </p>
      )}
      {board?.error && !needsReauth && (
        <p className="mt-6 rounded-2 border-2 border-orange bg-orange/5 px-4 py-3 text-sm text-fg-1">
          Couldn’t reach Slack just now ({board.error}). It’ll retry
          automatically, or hit Refresh.
        </p>
      )}

      {/* Sections ------------------------------------------------------------ */}
      <div className="mt-6 space-y-8">
        {visibleSections.map((section) => (
          <BucketSection
            key={section.key}
            section={section}
            cards={section.cards}
            mounted={mounted}
            filtered={tab !== 'all'}
            onAction={onAction}
            onUndo={onUndo}
            onReplied={onReplied}
          />
        ))}
      </div>

      {/* Disconnect, tucked at the bottom ------------------------------------ */}
      <details className="mt-12 border-t-2 border-paper-edge pt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-fg-3 hover:text-orange">
          Slack connection
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-fg-2">
          <Slack className="h-4 w-4 text-fg-3" />
          <span>Connected.</span>
          {/* Reconnect re-runs the Slack approval to pick up new permissions
              WITHOUT losing your follow-up list. Use this (not Disconnect) when
              a new scope is added. */}
          <a href="/api/slack/connect" className="bt-btn bt-btn-ghost text-xs">
            Reconnect
          </a>
          <form action={disconnectSlack}>
            <button type="submit" className="bt-btn bt-btn-ghost text-xs text-red-600">
              Disconnect
            </button>
          </form>
        </div>
        <p className="mt-2 text-xs text-fg-3">
          Reconnect keeps your follow-ups; Disconnect forgets your Slack token.
        </p>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move a card into "Waiting" locally (used right after a reply posts).
// ---------------------------------------------------------------------------
function moveToWaiting(board: Board, id: string, myLine: string): Board {
  const keys: Bucket[] = ['needs_reply', 'waiting', 'followup', 'handled', 'fyi'];
  let moved: TriageCard | undefined;
  const next = { ...board };
  for (const k of keys) {
    const found = board[k].find((c) => c.id === id);
    if (found) moved = found;
    next[k] = board[k].filter((c) => c.id !== id);
  }
  if (moved) {
    next.waiting = [
      { ...moved, bucket: 'waiting', userLastLine: myLine },
      ...next.waiting,
    ];
  }
  return next;
}

// ---------------------------------------------------------------------------
// One bucket + its cards
// ---------------------------------------------------------------------------

function BucketSection({
  section,
  cards,
  mounted,
  filtered,
  onAction,
  onUndo,
  onReplied,
}: {
  section: Section;
  cards: TriageCard[];
  mounted: boolean;
  filtered: boolean;
  onAction: (id: string, action: 'handled' | 'followup', card: TriageCard) => void;
  onUndo: (id: string) => void;
  onReplied: (id: string, text: string) => void;
}) {
  const header = (
    <div className="flex items-baseline gap-3">
      <h2
        className={`font-headline text-xl font-black uppercase ${
          section.tone === 'danger' ? 'text-orange-press' : 'text-bark-deep'
        }`}
      >
        {section.title}
      </h2>
      <span className="text-sm font-bold text-fg-3">{cards.length}</span>
    </div>
  );

  const list = (
    <CardList
      cards={cards}
      section={section}
      mounted={mounted}
      onAction={onAction}
      onUndo={onUndo}
      onReplied={onReplied}
    />
  );

  // In the "All" view, the quiet buckets collapse so they don't shout. When
  // the user has filtered to a single tab, always show it fully expanded.
  if (section.collapsedInAll && !filtered) {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between">
            {header}
            <span className="text-xs text-fg-3 group-open:hidden">Show</span>
            <span className="hidden text-xs text-fg-3 group-open:inline">Hide</span>
          </div>
          <p className="mt-1 text-xs text-fg-3">{section.blurb}</p>
        </summary>
        {list}
      </details>
    );
  }

  return (
    <section
      className={
        section.tone === 'danger'
          ? 'rounded-card border-[3px] border-orange bg-orange/5 p-5'
          : section.tone === 'accent'
            ? 'rounded-card border-[3px] border-lime p-5'
            : ''
      }
    >
      {header}
      <p className="mt-1 text-xs text-fg-3">{section.blurb}</p>
      {list}
    </section>
  );
}

function CardList({
  cards,
  section,
  mounted,
  onAction,
  onUndo,
  onReplied,
}: {
  cards: TriageCard[];
  section: Section;
  mounted: boolean;
  onAction: (id: string, action: 'handled' | 'followup', card: TriageCard) => void;
  onUndo: (id: string) => void;
  onReplied: (id: string, text: string) => void;
}) {
  if (cards.length === 0) {
    return (
      <p className="mt-3 text-sm text-fg-3">
        {section.tone === 'danger' ? 'Nothing needs you right now. ✿' : 'Nothing here.'}
      </p>
    );
  }
  return (
    <ul className="mt-3 space-y-3">
      {cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          mounted={mounted}
          onAction={onAction}
          onUndo={onUndo}
          onReplied={onReplied}
        />
      ))}
    </ul>
  );
}

function Card({
  card,
  mounted,
  onAction,
  onUndo,
  onReplied,
}: {
  card: TriageCard;
  mounted: boolean;
  onAction: (id: string, action: 'handled' | 'followup', card: TriageCard) => void;
  onUndo: (id: string) => void;
  onReplied: (id: string, text: string) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inHandled = card.bucket === 'handled';
  const inFollowup = card.bucket === 'followup';

  async function submitReply() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    const res = await sendReply(card.channelId, card.threadTs, text);
    setSending(false);
    if (res.ok) {
      onReplied(card.id, text.trim());
      setReplyOpen(false);
      setText('');
    } else {
      setError(
        res.error === 'reauth'
          ? 'Reconnect Slack to enable replies (bottom of the page).'
          : 'Couldn’t send. Try again.',
      );
    }
  }

  return (
    <li className="rounded-2 border-2 border-paper-edge bg-white p-4">
      <div className="flex items-start gap-3">
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
              {mounted ? formatDistanceToNow(card.timestampMs, { addSuffix: true }) : ''}
            </span>
          </div>

          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-1">
            {card.text}
          </p>

          {/* Group cards: at-a-glance reply status for monitoring. */}
          {card.replyCount !== undefined && (
            <p
              className={`mt-2 text-xs font-bold ${
                card.replyCount > 0 ? 'text-green-dark' : 'text-orange-press'
              }`}
            >
              {card.replyCount > 0
                ? `Answered · ${card.replyCount} ${
                    card.replyCount === 1 ? 'reply' : 'replies'
                  }${card.lastReplyBy ? ` · last: ${card.lastReplyBy}` : ''}`
                : 'No reply yet'}
            </p>
          )}

          {card.userLastLine && (
            <p className="mt-2 border-l-2 border-paper-edge pl-3 text-xs italic text-fg-3">
              You said: “{card.userLastLine}”
            </p>
          )}

          {/* Action row ---------------------------------------------------- */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold uppercase tracking-wide">
            <button
              type="button"
              onClick={() => setReplyOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-orange hover:text-orange-press"
            >
              <CornerUpLeft className="h-3.5 w-3.5" /> Reply
            </button>

            {inHandled || inFollowup ? (
              <button
                type="button"
                onClick={() => onUndo(card.id)}
                className="inline-flex items-center gap-1 text-fg-3 hover:text-ink"
              >
                <Undo2 className="h-3.5 w-3.5" /> Move back
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onAction(card.id, 'handled', card)}
                  className="inline-flex items-center gap-1 text-fg-3 hover:text-green-dark"
                >
                  <Check className="h-3.5 w-3.5" /> Handled
                </button>
                <button
                  type="button"
                  onClick={() => onAction(card.id, 'followup', card)}
                  className="inline-flex items-center gap-1 text-fg-3 hover:text-orange"
                >
                  <Flag className="h-3.5 w-3.5" /> Follow up
                </button>
              </>
            )}

            {card.permalink && (
              <a
                href={card.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-fg-3 hover:text-orange"
              >
                Open in Slack <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Reply box ----------------------------------------------------- */}
          {replyOpen && (
            <div className="mt-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Write a reply — it posts to this thread as you."
                className="w-full rounded-2 border-2 border-paper-edge p-2 text-sm text-ink focus:border-orange focus:outline-none"
              />
              {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={sending || !text.trim()}
                  className="bt-btn bt-btn-primary text-xs disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyOpen(false);
                    setError(null);
                  }}
                  className="text-xs font-bold uppercase tracking-wide text-fg-3 hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

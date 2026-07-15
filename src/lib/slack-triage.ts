// ============================================================================
// Slack Tag Triage — the sorting brain. SERVER ONLY.
// ============================================================================
// Fetching tagged messages is the easy part. Sorting them so the 2 that need
// you float to the top and the 40 that don't sink is the whole point. Two
// rules, learned from real data, do the work:
//
//   Rule 1 — a bot cc is not a real tag. A scheduling bot cc's the user on
//   nearly every cancellation; those mean nothing personally. A human asking a
//   direct question is signal. So bot-authored mentions (and messages that
//   cc a whole usergroup plus several people) go to a muted "FYI" pile, never
//   to "needs a reply".
//
//   Rule 2 — "the user already replied" does NOT mean "handled". A thread where
//   the user's last line was "let's circle back after you finish the list" is
//   still open, waiting on the other person. So we look at the thread AFTER the
//   user's reply to decide, not just whether a reply exists.
//
// The keyword/reaction heuristics below are deliberately simple and rough — a
// crude rule the user can eyeball and correct beats a clever one they can't.
// They're the obvious knobs to tune as real messages come through.
// ============================================================================

import {
  fetchChannelAfter,
  fetchThread,
  getConnection,
  makeUserResolver,
  displayName,
  searchMentions,
  SlackApiError,
  type SlackMessage,
  type SlackSearchMatch,
} from './slack';

// 'followup' isn't produced by the auto-sorter — it's a bucket the user moves
// things into by hand (a personal to-do / follow-up list). Same for 'handled'
// being set manually via the "Handled" button.
export type Bucket = 'needs_reply' | 'waiting' | 'followup' | 'handled' | 'fyi';

// The manual actions the user can take on a card, persisted per-message so they
// stick across refreshes. `null` means "no override — trust the auto-sorter".
export type MessageAction = 'handled' | 'followup';
export type OverrideMap = Record<string, MessageAction>;

export type TriageCard = {
  id: string; // channel + ts, stable per message
  bucket: Bucket;
  authorName: string;
  authorInitials: string;
  isBot: boolean;
  channelName: string;
  // channel + thread root, kept so we can post a reply back into the thread.
  channelId: string;
  threadTs: string;
  text: string;
  permalink: string | null;
  timestampMs: number; // for relative-time rendering in the browser
  // For "waiting" cards: the user's own last line, so they remember the state.
  userLastLine?: string;
};

export type TriageBoard = {
  needs_reply: TriageCard[];
  waiting: TriageCard[];
  followup: TriageCard[];
  handled: TriageCard[];
  fyi: TriageCard[];
  fetchedAt: number; // epoch ms
  // Which week this board covers. 0 = this week, -1 = last week. weekLabel is
  // a human string like "Jul 12 – Jul 18"; weekStartMs pins the Sunday so the
  // page can tell whether a cached board is still the current week.
  weekOffset: number;
  weekLabel: string;
  weekStartMs: number;
  // Set when we capped how many mentions we processed, so the UI can say so
  // rather than silently implying it covered everything.
  truncatedAt?: number;
  // Set when the whole fetch failed (e.g. the token was revoked in Slack).
  error?: string;
};

// ---------------------------------------------------------------------------
// Week windows (Sunday–Saturday, in the business's timezone)
// ---------------------------------------------------------------------------
// The board shows one week at a time, resetting each Sunday, with a toggle for
// this week vs last week. Everything is computed in Central time (the business
// runs on Central) so "this week" matches what the user sees on a wall calendar
// regardless of the server's timezone.

const TZ = 'America/Chicago';

export type WeekWindow = {
  offset: number; // 0 = this week, -1 = last week
  startMs: number; // Sunday 00:00 Central
  endMs: number; // next Sunday 00:00 Central (exclusive)
  label: string; // e.g. "Jul 12 – Jul 18"
  after: string; // YYYY-MM-DD, padded a day, for Slack's after: search modifier
  before: string; // YYYY-MM-DD, padded a day, for before:
};

function centralYMDW(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g('weekday')]!;
  return { y: +g('year'), m: +g('month'), d: +g('day'), wd };
}

// Convert a Central wall-clock midnight (y-m-d) to an epoch, accounting for the
// Central UTC offset in effect that day (handles CST/CDT without hardcoding).
function centralMidnightToEpoch(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const asC = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ }));
  const asU = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess + (asU.getTime() - asC.getTime());
}

const ymdCentral = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);

const dayLabel = (ms: number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(ms);

export function weekBounds(offset = 0): WeekWindow {
  const { y, m, d, wd } = centralYMDW(new Date());
  // Do calendar math in UTC (no DST) to find the Sunday's date, then convert
  // each date's Central midnight to a precise epoch.
  const today = new Date(Date.UTC(y, m - 1, d));
  const sunday = new Date(today.getTime() - wd * 86400000 + offset * 7 * 86400000);
  const next = new Date(sunday.getTime() + 7 * 86400000);
  const startMs = centralMidnightToEpoch(
    sunday.getUTCFullYear(),
    sunday.getUTCMonth() + 1,
    sunday.getUTCDate(),
  );
  const endMs = centralMidnightToEpoch(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
  return {
    offset,
    startMs,
    endMs,
    label: `${dayLabel(startMs)} – ${dayLabel(endMs - 1000)}`,
    after: ymdCentral(startMs - 86400000),
    before: ymdCentral(endMs + 86400000),
  };
}

// ---------------------------------------------------------------------------
// Heuristics (pure — easy to unit-test and tune)
// ---------------------------------------------------------------------------

// Phrases where the user is handing the ball to someone else / awaiting them.
const ACTION_PATTERNS = [
  /\?\s*$/, // ends in a question
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bwould you\b/i,
  /\bplease\b/i,
  /\blet me know\b/i,
  /\bcircle back\b/i,
  /\b(report|get) back\b/i,
  /\bfollow up\b/i,
  /\bwhen you\b/i,
  /\bonce you\b/i,
  /\bafter you\b/i,
  /\bwaiting on\b/i,
  /\bcan we\b/i,
];

// Signals a loop closed: the other party acknowledged / confirmed done.
const CLOSED_PATTERNS = [
  /\bthanks\b/i,
  /\bthank you\b/i,
  /\bthx\b/i,
  /\bdone\b/i,
  /\bgot it\b/i,
  /\bperfect\b/i,
  /\bsounds good\b/i,
  /\bwill do\b/i,
  /\ball set\b/i,
  /\bappreciate it\b/i,
  /\bconfirmed\b/i,
  /\b👍\b/,
  /\b🙏\b/,
  /\b✅\b/,
];

// Reaction emoji (names, no colons) that read as "acknowledged / closed".
const CLOSED_REACTIONS = new Set([
  'white_check_mark',
  'heavy_check_mark',
  'ballot_box_with_check',
  '+1',
  'thumbsup',
  'pray',
  'tada',
  'ok_hand',
  'raised_hands',
]);

export function userAskedForAction(text: string | undefined): boolean {
  if (!text) return false;
  return ACTION_PATTERNS.some((re) => re.test(text));
}

function hasClosedReaction(msg: SlackMessage | undefined): boolean {
  return !!msg?.reactions?.some((r) => CLOSED_REACTIONS.has(r.name));
}

/** Did the loop visibly close in the messages after the user's last reply? */
export function closedSignal(
  msgsAfter: SlackMessage[],
  lastUserMsg: SlackMessage,
): boolean {
  if (hasClosedReaction(lastUserMsg)) return true;
  return msgsAfter.some(
    (m) => CLOSED_PATTERNS.some((re) => re.test(m.text ?? '')) || hasClosedReaction(m),
  );
}

/** Did a real human other than the user post after the user's last reply? */
function someoneElseReplied(msgsAfter: SlackMessage[], currentUserId: string): boolean {
  return msgsAfter.some((m) => m.user && m.user !== currentUserId && !m.bot_id);
}

// Rule 1's second signal: a message that cc's a whole usergroup/subteam AND
// several individuals is the bot-broadcast shape, even if we couldn't confirm
// the author is a bot. `<!subteam^…>` is Slack's usergroup mention syntax.
export function looksLikeBotCc(text: string | undefined): boolean {
  if (!text) return false;
  const mentionsSubteam = /<!subteam\^/.test(text);
  const peopleCount = (text.match(/<@[^>]+>/g) ?? []).length;
  return mentionsSubteam && peopleCount >= 3;
}

// Rule 1, extended: some channels are noise by nature — a tag there almost
// never needs a personal reply, even from a human (e.g. the cancellations
// channel, road-closure permits). Anything posted in one of these drops
// straight to the muted "FYI" pile. Edit this list to add/remove channels;
// match is case-insensitive and ignores a leading "#".
// Written however reads naturally — matching ignores case and every kind of
// separator (spaces, hyphens, underscores), so "road closure" matches a
// channel named "#road_closure-permits-etc".
const MUTED_CHANNELS = [
  'road closure',
];

// Collapse a channel name to just its letters/numbers for tolerant matching.
const normChannel = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();

export function isMutedChannel(channelName: string | undefined): boolean {
  if (!channelName) return false;
  const norm = normChannel(channelName);
  return MUTED_CHANNELS.some((c) => norm.includes(normChannel(c)));
}

// Rule 1, also extended by content: some recurring broadcasts are noise no
// matter who posts them or where — e.g. the daily schedule post that opens
// "Good day, @… This is our schedule for …". Matching these by their opening
// text sends them straight to FYI. Add patterns here as new ones show up.
const MUTED_MESSAGE_PATTERNS = [
  /good day[\s\S]{0,400}this is our schedule for/i,
];

export function isMutedMessage(text: string | undefined): boolean {
  if (!text) return false;
  return MUTED_MESSAGE_PATTERNS.some((re) => re.test(text));
}

const tsNum = (ts: string) => parseFloat(ts) || 0;

/**
 * The core decision, kept pure: given a thread and who the author/current user
 * are, which bucket does this mention land in? Mirrors the spec's pseudocode.
 */
export function bucketMention(args: {
  thread: SlackMessage[];
  currentUserId: string;
  authorIsBot: boolean;
  matchText: string;
}): Bucket {
  const { thread, currentUserId, authorIsBot, matchText } = args;

  // Rule 1
  if (authorIsBot || looksLikeBotCc(matchText)) return 'fyi';

  const userMsgs = thread.filter((m) => m.user === currentUserId);

  // The human tagged them and they haven't spoken in the thread yet.
  if (userMsgs.length === 0) return 'needs_reply';

  // Rule 2: look at what happened AFTER the user's last message.
  const lastUserMsg = userMsgs.reduce((a, b) => (tsNum(b.ts) > tsNum(a.ts) ? b : a));
  const after = thread.filter((m) => tsNum(m.ts) > tsNum(lastUserMsg.ts));

  if (userAskedForAction(lastUserMsg.text) && !someoneElseReplied(after, currentUserId)) {
    return 'waiting'; // ball is in their court
  }
  if (closedSignal(after, lastUserMsg)) return 'handled';
  if (after.length === 0) return 'waiting'; // user spoke last, loop not visibly closed
  return 'handled';
}

// ---------------------------------------------------------------------------
// Orchestration: fetch → bucket → board
// ---------------------------------------------------------------------------

// Cap how many mentions we process per refresh. Slack search is rate-limited
// and a very busy account could return hundreds; the top slice (newest first)
// is what matters, and we flag when we've capped rather than pretend we saw all.
const MAX_MATCHES = 100; // per week; a single week rarely exceeds this
const BATCH_SIZE = 5; // gentle concurrency so we don't trip rate limits

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Bratt Tree naming convention: First Name + Last Initial everywhere in the UI
// ("Nicolas Lovdahl" → "Nicolas L"), never a full last name. Single-token
// names (handles like "nlovdahl") are left as-is.
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`;
}

function channelLabel(match: SlackSearchMatch): string {
  const ch = match.channel;
  if (!ch) return 'Slack';
  if (ch.is_im) return 'Direct message';
  if (ch.name) return `#${ch.name}`;
  return 'Slack';
}

/**
 * Turns Slack's raw message markup into plain readable text:
 *   <@U123|Molly Axberg>  → @Molly A       (mentions, shortened per convention)
 *   <@U123>               → @Molly A       (resolved via the API when no label)
 *   <#C123|schedule>      → #schedule      (channel links)
 *   <!subteam^S1|sales>   → @sales         (usergroup mentions)
 *   <!here> / <!channel>  → @here / @channel
 *   <https://x|label>     → label          (links show their label, or the URL)
 * and unescapes Slack's &amp; &lt; &gt;. Async because bare user mentions need
 * a name lookup (memoized by the shared resolver, so it's cheap).
 */
export async function humanizeSlackText(
  text: string,
  resolveUser: ReturnType<typeof makeUserResolver>,
): Promise<string> {
  if (!text) return '';

  // Resolve any bare <@ID> mentions (no |label) up front.
  const bareIds = Array.from(text.matchAll(/<@([A-Z0-9]+)>/g)).map((m) => m[1]);
  const names = new Map<string, string>();
  await Promise.all(
    bareIds.map(async (id) => {
      const u = await resolveUser(id);
      names.set(id, shortName(displayName(u, id)));
    }),
  );

  let out = text
    // Mentions with a label (Slack often includes the display name).
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, (_, label) => `@${shortName(label)}`)
    // Bare mentions, resolved above.
    .replace(/<@([A-Z0-9]+)>/g, (_, id) => `@${names.get(id) ?? 'someone'}`)
    // Usergroup / channel-wide.
    .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]+))?>/g, (_, label) => `@${label ?? 'group'}`)
    .replace(/<!(here|channel|everyone)>/g, (_, w) => `@${w}`)
    // Channel links.
    .replace(/<#C[A-Z0-9]+(?:\|([^>]+))?>/g, (_, label) => `#${label ?? 'channel'}`)
    // Plain links: show the label if there is one, else the URL.
    .replace(/<(https?:[^|>]+)(?:\|([^>]+))?>/g, (_, url, label) => label ?? url);

  // Unescape the three entities Slack encodes in message text.
  out = out.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return out;
}

export function emptyBoard(week: WeekWindow = weekBounds(0)): TriageBoard {
  return {
    needs_reply: [],
    waiting: [],
    followup: [],
    handled: [],
    fyi: [],
    fetchedAt: Date.now(),
    weekOffset: week.offset,
    weekLabel: week.label,
    weekStartMs: week.startMs,
  };
}

const BUCKET_KEYS = ['needs_reply', 'waiting', 'followup', 'handled', 'fyi'] as const;
// Buckets that come from the week's search. Follow-up is NOT here — it's a
// persistent, week-independent list assembled from saved snapshots.
const WEEK_BUCKET_KEYS = ['needs_reply', 'waiting', 'handled', 'fyi'] as const;

/**
 * Assembles the board the user sees from three inputs:
 *   - `week`: the auto-sorted buckets for the selected week (from Slack search)
 *   - `handledIds`: messages the user manually marked Handled (persisted)
 *   - `followupCards`: the persistent Follow-up list (saved snapshots, ANY week)
 *
 * Follow-up lives outside the weekly buckets so it never resets when the week
 * rolls over. A weekly card that's also on the Follow-up list is shown only in
 * Follow-up (not duplicated). Pure and cheap — no API calls — so buttons feel
 * instant and survive reloads.
 */
export function composeBoard(
  week: TriageBoard,
  handledIds: Set<string>,
  followupCards: TriageCard[],
): TriageBoard {
  const out = emptyBoard();
  out.fetchedAt = week.fetchedAt;
  out.truncatedAt = week.truncatedAt;
  out.error = week.error;
  out.weekOffset = week.weekOffset;
  out.weekLabel = week.weekLabel;
  out.weekStartMs = week.weekStartMs;

  const followupIds = new Set(followupCards.map((c) => c.id));
  // `week[k] ?? []` guards against an older cached board missing a bucket.
  const all = WEEK_BUCKET_KEYS.flatMap((k) => week[k] ?? []);
  for (const card of all) {
    if (followupIds.has(card.id)) continue; // shown only in the Follow-up list
    const bucket: Bucket = handledIds.has(card.id) ? 'handled' : card.bucket;
    out[bucket].push({ ...card, bucket });
  }
  out.followup = followupCards.map((c) => ({ ...c, bucket: 'followup' as const }));

  for (const k of BUCKET_KEYS) {
    out[k].sort((a, b) => b.timestampMs - a.timestampMs);
  }
  return out;
}

/**
 * Builds the whole board for a user: runs the mention search, pulls each
 * thread, and buckets it. Returns a board even on partial failure (a single
 * bad thread is skipped, not fatal); a total-auth failure comes back as an
 * `error` board so the UI can prompt a reconnect.
 */
export async function buildBoard(
  ownerEmail: string,
  offsetWeeks = 0,
): Promise<TriageBoard> {
  const week = weekBounds(offsetWeeks);
  const empty = () => emptyBoard(week);

  const conn = await getConnection(ownerEmail);
  if (!conn) return { ...empty(), error: 'not_connected' };

  const resolveUser = makeUserResolver(conn.token);

  let matches: SlackSearchMatch[];
  try {
    matches = await searchMentions(conn.token, conn.slackUserId, {
      after: week.after,
      before: week.before,
    });
  } catch (e) {
    if (e instanceof SlackApiError) {
      // Token no longer valid → tell the UI to prompt a reconnect.
      if (['invalid_auth', 'not_authed', 'token_revoked', 'account_inactive'].includes(e.code)) {
        return { ...empty(), error: 'reauth' };
      }
      return { ...empty(), error: e.code };
    }
    return { ...empty(), error: 'fetch_failed' };
  }

  // Slack's after:/before: are day-granular, so trim precisely to the week.
  matches = matches.filter((m) => {
    const ms = tsNum(m.ts) * 1000;
    return ms >= week.startMs && ms < week.endMs;
  });

  const board = empty();
  if (matches.length > MAX_MATCHES) board.truncatedAt = MAX_MATCHES;
  const capped = matches.slice(0, MAX_MATCHES);

  for (let i = 0; i < capped.length; i += BATCH_SIZE) {
    const batch = capped.slice(i, i + BATCH_SIZE);
    const cards = await Promise.all(
      batch.map((match) => cardFor(match, conn.slackUserId, conn.token, resolveUser)),
    );
    for (const card of cards) {
      if (card) board[card.bucket].push(card);
    }
  }

  // Newest first inside each bucket.
  for (const key of BUCKET_KEYS) {
    board[key].sort((a, b) => b.timestampMs - a.timestampMs);
  }
  return board;
}

// Slack search tells us a matched message's ts, but if that message is a REPLY
// inside a thread, its ts is NOT the thread root — and conversations.replies
// needs the root. Search doesn't reliably include thread_ts on the match, but
// the permalink always carries it (…?thread_ts=123.456&…), so we read it there.
function threadRootFromPermalink(permalink: string | null | undefined): string | undefined {
  if (!permalink) return undefined;
  const m = permalink.match(/[?&]thread_ts=([0-9.]+)/);
  return m ? m[1] : undefined;
}

async function cardFor(
  match: SlackSearchMatch,
  currentUserId: string,
  token: string,
  resolveUser: ReturnType<typeof makeUserResolver>,
): Promise<TriageCard | null> {
  const channelId = match.channel?.id;
  if (!channelId) return null;

  const text = match.text ?? '';
  // A message with a bot_id and no user is bot-authored (cheap to know).
  const isBot = !!match.bot_id && !match.user;

  // The thread root: prefer the match's own thread_ts, then the one baked into
  // the permalink, then the message ts itself (for a genuine top-level message).
  const threadRoot =
    match.thread_ts || threadRootFromPermalink(match.permalink) || match.ts;

  // PERF: decide the cheap "this is noise → FYI" cases with NO API calls, and
  // skip the expensive thread/channel/user lookups for them. Broadcasts (the
  // daily schedule + road-closure posts), bot cc's, and usergroup blasts are
  // the bulk of the volume, so short-circuiting them is the difference between
  // a snappy refresh and a rate-limited crawl.
  const cheapFyi =
    isBot ||
    isMutedChannel(match.channel?.name) ||
    isMutedMessage(text) ||
    looksLikeBotCc(text);

  let bucket: Bucket;
  let thread: SlackMessage[] | null = null;
  if (cheapFyi) {
    bucket = 'fyi';
  } else {
    // Pull the thread so Rule 2 can see what happened after the user's reply.
    // A single unreadable thread (deleted, no access) shouldn't sink the board.
    try {
      thread = await fetchThread(token, channelId, threadRoot);
    } catch {
      thread = [{ ts: match.ts, text, user: match.user, bot_id: match.bot_id }];
    }

    // In this workspace people often reply as a NEW channel message rather than
    // threading it, so the thread looks empty even though the user answered. If
    // the thread shows no reply from the user, also fold in what was posted in
    // the channel after the tag — that's where the reply lives.
    if (!thread.some((m) => m.user === currentUserId)) {
      try {
        const after = await fetchChannelAfter(token, channelId, match.ts);
        const seen = new Set(thread.map((m) => m.ts));
        for (const m of after) if (!seen.has(m.ts)) thread.push(m);
      } catch {
        // No channel history access — fall back to the thread alone.
      }
    }

    bucket = bucketMention({ thread, currentUserId, authorIsBot: false, matchText: text });
  }

  // Author name: prefer the username Slack already handed us in the search hit,
  // so we avoid a users.info call per card. Only look it up when it's missing.
  const author = !match.username && match.user ? await resolveUser(match.user) : null;
  const name = shortName(displayName(author, match.username ?? (isBot ? 'Bot' : undefined)));

  const card: TriageCard = {
    id: `${channelId}:${match.ts}`,
    bucket,
    authorName: name,
    authorInitials: initials(name),
    isBot,
    channelName: channelLabel(match),
    channelId,
    threadTs: threadRoot,
    text: await humanizeSlackText(text, resolveUser),
    permalink: match.permalink ?? null,
    timestampMs: Math.round(tsNum(match.ts) * 1000),
  };

  // For "waiting" cards, attach the user's own last line as context.
  if (bucket === 'waiting' && thread) {
    const mine = thread
      .filter((m) => m.user === currentUserId && m.text)
      .sort((a, b) => tsNum(b.ts) - tsNum(a.ts))[0];
    if (mine?.text) card.userLastLine = await humanizeSlackText(mine.text, resolveUser);
  }

  return card;
}

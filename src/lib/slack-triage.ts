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
  // Set when we capped how many mentions we processed, so the UI can say so
  // rather than silently implying it covered everything.
  truncatedAt?: number;
  // Set when the whole fetch failed (e.g. the token was revoked in Slack).
  error?: string;
};

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
const MAX_MATCHES = 60;
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

export function emptyBoard(): TriageBoard {
  return {
    needs_reply: [],
    waiting: [],
    followup: [],
    handled: [],
    fyi: [],
    fetchedAt: Date.now(),
  };
}

const BUCKET_KEYS = ['needs_reply', 'waiting', 'followup', 'handled', 'fyi'] as const;

/**
 * Re-sorts a freshly-built board by the user's manual overrides: a message
 * marked "handled" or "followup" is pulled out of whatever the auto-sorter
 * chose and placed in that bucket instead. Pure and cheap (no API calls), so
 * the Handled / Follow-up buttons feel instant and survive a page reload.
 */
export function applyOverrides(board: TriageBoard, overrides: OverrideMap): TriageBoard {
  const out = emptyBoard();
  out.fetchedAt = board.fetchedAt;
  out.truncatedAt = board.truncatedAt;
  out.error = board.error;

  // `board[k] ?? []` guards against an older cached board that predates a
  // bucket (e.g. 'followup'), so a stale cache can't crash the first render.
  const all = BUCKET_KEYS.flatMap((k) => board[k] ?? []);
  for (const card of all) {
    const override = overrides[card.id];
    const bucket: Bucket = override ?? card.bucket;
    out[bucket].push({ ...card, bucket });
  }
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
export async function buildBoard(ownerEmail: string): Promise<TriageBoard> {
  const empty = emptyBoard;

  const conn = await getConnection(ownerEmail);
  if (!conn) return { ...empty(), error: 'not_connected' };

  const resolveUser = makeUserResolver(conn.token);

  let matches: SlackSearchMatch[];
  try {
    matches = await searchMentions(conn.token, conn.slackUserId);
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

  // The thread root: prefer the match's own thread_ts, then the one baked into
  // the permalink, then the message ts itself (for a genuine top-level message).
  const threadRoot =
    match.thread_ts || threadRootFromPermalink(match.permalink) || match.ts;

  // Pull the thread so Rule 2 can see what happened after the user's reply.
  // A single unreadable thread (deleted, no access) shouldn't sink the board.
  let thread: SlackMessage[];
  try {
    thread = await fetchThread(token, channelId, threadRoot);
  } catch {
    // Fall back to treating the match as a standalone message.
    thread = [{ ts: match.ts, text: match.text, user: match.user, bot_id: match.bot_id }];
  }

  // In this workspace people often reply as a NEW channel message rather than
  // threading it, so the thread looks empty even though the user answered. If
  // the thread shows no reply from the user, also pull what was posted in the
  // channel after the tag and fold it in — that's where the reply lives.
  const userInThread = thread.some((m) => m.user === currentUserId);
  if (!userInThread) {
    try {
      const after = await fetchChannelAfter(token, channelId, match.ts);
      const seen = new Set(thread.map((m) => m.ts));
      for (const m of after) if (!seen.has(m.ts)) thread.push(m);
    } catch {
      // No channel history access — fall back to the thread alone.
    }
  }

  // Is the author a bot? A message with a bot_id and no user is a bot; else
  // resolve the user and check is_bot.
  let authorIsBot = !!match.bot_id && !match.user;
  const author = match.user ? await resolveUser(match.user) : null;
  if (author?.is_bot) authorIsBot = true;

  let bucket = bucketMention({
    thread,
    currentUserId,
    authorIsBot,
    matchText: match.text ?? '',
  });
  // Rule 1 extended: messages from a muted channel are always FYI.
  if (isMutedChannel(match.channel?.name)) bucket = 'fyi';

  const name = shortName(
    authorIsBot
      ? displayName(author, match.username ?? 'Bot')
      : displayName(author, match.username),
  );

  const card: TriageCard = {
    id: `${channelId}:${match.ts}`,
    bucket,
    authorName: name,
    authorInitials: initials(name),
    isBot: authorIsBot,
    channelName: channelLabel(match),
    channelId,
    threadTs: threadRoot,
    text: await humanizeSlackText(match.text ?? '', resolveUser),
    permalink: match.permalink ?? null,
    timestampMs: Math.round(tsNum(match.ts) * 1000),
  };

  // For "waiting" cards, attach the user's own last line as context.
  if (bucket === 'waiting') {
    const mine = thread
      .filter((m) => m.user === currentUserId && m.text)
      .sort((a, b) => tsNum(b.ts) - tsNum(a.ts))[0];
    if (mine?.text) card.userLastLine = await humanizeSlackText(mine.text, resolveUser);
  }

  return card;
}

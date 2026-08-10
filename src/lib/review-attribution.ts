// ============================================================================
// Proposal-review attribution — who is reviewing the sales team's proposals?
// ============================================================================
// SERVER ONLY (it holds a live Slack token).
//
// THE QUESTION
//
// Each sales arborist has their own Slack channel. When a proposal is ready for
// a supervisor to look at, they post a short message @-mentioning the review
// group — "ready", "review please", just an address, or nothing but the mention.
// A supervisor then drops a ❤️ on that message to mark it reviewed. This module
// counts those hearts and says who left them.
//
// WHY THIS ISN'T SOMETHING YOU CAN JUST READ OFF SLACK
//
// Slack's UI shows that a message got one heart but not WHO left it — you have
// to open each message to see the name. Over three months that's ~2,500
// messages, so doing it by eye means sampling, and a sample only gives a range.
//
// `conversations.history` has no such limit: every message comes back with its
// full reaction list, and each reaction carries the member IDs of everyone who
// reacted. One call covers up to 999 messages. That turns "weeks of clicking"
// into a few dozen API calls, which is the whole reason this report can exist.
// ============================================================================

import { fetchChannelRange, makeUserResolver, displayName, type SlackMessage } from './slack';

// ---------------------------------------------------------------------------
// CONFIG — the three things that go stale. Keep them here, together.
// ---------------------------------------------------------------------------

/**
 * The per-arborist sales channels. IDs are stable, so renaming a channel in
 * Slack won't break this; the names are only for display.
 *
 * Hard-coded rather than auto-discovered because listing channels needs the
 * `groups:read` scope, which our Slack app deliberately doesn't request.
 * To add a new arborist: in Slack open their channel → View channel details →
 * copy the Channel ID from the bottom of that panel.
 */
export const SALES_CHANNELS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'C08GEMZRJJ0', name: 'clayton_sales' },
  { id: 'C0804TLLP8S', name: 'jacob_sales' },
  { id: 'C08THL0T6GL', name: 'patrick_w_sales' },
  { id: 'C0775BSQ69W', name: 'dave_sales' },
  { id: 'C08SFKNJ550', name: 'hayden_sales' },
  { id: 'C0669CMAD19', name: 'ian_sales' },
  { id: 'C0APDGJCUKA', name: 'jake_sales' },
  { id: 'C08SH7U5Y20', name: 'tj_sales' },
  { id: 'C0B72PBBAUX', name: 'alex_sales' },
];

/**
 * The Slack user-group the arborists @-mention to ask for a review. In message
 * text a group mention looks like `<!subteam^S0911Q0HTDF>`, so matching that
 * substring is far more reliable than matching words — people write "ready",
 * "review please", an address, or nothing at all.
 */
export const REVIEW_SUBTEAM_ID = 'S0911Q0HTDF';

/** The reaction(s) that mean "I reviewed this." */
export const REVIEW_EMOJI: ReadonlyArray<string> = ['heart'];

/** Everything is bucketed in Twin Cities local time. */
const TIMEZONE = 'America/Chicago';

const WORKSPACE = 'bratttree';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewRow = {
  channelId: string;
  channelName: string;
  ts: string;
  date: string; // YYYY-MM-DD, Twin Cities
  weekday: string; // Mon…Sun
  week: string; // Monday of that week, YYYY-MM-DD
  reviewerIds: string[];
  reviewed: boolean;
  /** Slack listed fewer reactors than it counted, so this row may undercount. */
  truncated: boolean;
  otherReactions: string[];
  permalink: string;
  text: string;
};

export type ReviewerTally = { id: string; name: string; count: number };

export type GroupTally = {
  label: string;
  total: number;
  perReviewer: Record<string, number>;
};

export type ReviewReport = {
  windowLabel: string;
  since: string;
  until: string;
  total: number;
  reviewedCount: number;
  unreviewedCount: number;
  /** Total (reviewer, message) pairs. Exceeds reviewedCount only when a
   *  message was hearted by two people, which is rare. All percentages are
   *  taken over this so the reviewer columns always sum to the total. */
  attributions: number;
  reviewers: ReviewerTally[];
  byWeek: GroupTally[];
  byChannel: GroupTally[];
  /** Anything that could make the numbers wrong, in plain English. */
  notes: string[];
  rows: ReviewRow[];
  apiCalls: number;
};

// ---------------------------------------------------------------------------
// Date helpers (Twin Cities local, no dependencies)
// ---------------------------------------------------------------------------

function localDate(tsSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(tsSeconds * 1000));
}

function localWeekday(tsSeconds: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).format(new Date(tsSeconds * 1000));
}

/**
 * The Monday of the week a timestamp falls in. Week is the level that actually
 * matters here: review coverage runs in multi-day blocks (one supervisor picks
 * up the load while the other is out), so a single overall percentage hides
 * real swings.
 */
function weekStart(tsSeconds: number): string {
  const [y, m, d] = localDate(tsSeconds).split('-').map(Number);
  // Build from the LOCAL calendar date in UTC so day-of-week arithmetic can't
  // be knocked off by the timezone offset.
  const date = new Date(Date.UTC(y, m - 1, d));
  const backToMonday = (date.getUTCDay() + 6) % 7; // getUTCDay: 0 = Sunday
  date.setUTCDate(date.getUTCDate() - backToMonday);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const isReviewRequest = (msg: SlackMessage): boolean =>
  typeof msg.text === 'string' && msg.text.includes(`<!subteam^${REVIEW_SUBTEAM_ID}>`);

/**
 * A Slack `ts` is "seconds.microseconds" and doubles as the message ID. Guard
 * against anything unparseable so one odd message can't take down a whole
 * three-month report.
 */
const hasUsableTs = (msg: SlackMessage): boolean => Number.isFinite(Number(msg?.ts));

function toRow(
  msg: SlackMessage,
  channel: { id: string; name: string },
  emoji: ReadonlyArray<string>,
): ReviewRow {
  const ts = Number(msg.ts);
  const reactions = msg.reactions ?? [];
  const reviewReactions = reactions.filter((r) => emoji.includes(r.name));

  // Slack truncates the `users` array on reactions with very many reactors.
  // Review hearts are essentially always count:1, but flag a mismatch instead
  // of silently attributing fewer reviewers than actually reacted.
  const truncated = reviewReactions.some((r) => (r.users?.length ?? 0) < (r.count ?? 0));

  return {
    channelId: channel.id,
    channelName: channel.name,
    ts: msg.ts,
    date: localDate(ts),
    weekday: localWeekday(ts),
    week: weekStart(ts),
    reviewerIds: [...new Set(reviewReactions.flatMap((r) => r.users ?? []))],
    reviewed: reviewReactions.some((r) => (r.users?.length ?? 0) > 0),
    truncated,
    // Every non-review reaction, so a change of convention (someone switching
    // to ✅) surfaces in the report instead of quietly zeroing the counts.
    otherReactions: reactions.filter((r) => !emoji.includes(r.name)).map((r) => r.name),
    permalink: `https://${WORKSPACE}.slack.com/archives/${channel.id}/p${msg.ts.replace('.', '')}`,
    text: (msg.text ?? '').replace(/\s+/g, ' ').slice(0, 160),
  };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * Sweeps every sales channel over the window and returns the full breakdown.
 *
 * Reads top-level channel messages only. A review request posted as a reply
 * *inside* another thread isn't visible to `conversations.history` and so isn't
 * counted — in spot-checking that's well under 1% of requests, and catching
 * them would mean one extra API call per thread (thousands), which no page
 * render can afford. The returned `notes` say so explicitly.
 */
export async function buildReviewReport(
  token: string,
  opts: { since: Date; until: Date },
): Promise<ReviewReport> {
  const oldest = Math.floor(opts.since.getTime() / 1000);
  const latest = Math.floor(opts.until.getTime() / 1000);
  const emoji = REVIEW_EMOJI;

  const rows: ReviewRow[] = [];
  const skipped: { channel: string; why: string }[] = [];
  let unusable = 0;
  let apiCalls = 0;

  for (const channel of SALES_CHANNELS) {
    let messages: SlackMessage[];
    try {
      messages = await fetchChannelRange(token, channel.id, oldest, latest);
      apiCalls++;
    } catch (err) {
      // A channel the token owner isn't in, or one archived/renamed away,
      // shouldn't kill the whole report — record it and carry on.
      const why = err instanceof Error ? err.message.replace(/^Slack API error: /, '') : 'unknown';
      skipped.push({ channel: channel.name, why });
      continue;
    }
    const found = messages.filter(isReviewRequest);
    const usable = found.filter(hasUsableTs);
    unusable += found.length - usable.length;
    for (const msg of usable) rows.push(toRow(msg, channel, emoji));
  }

  rows.sort((a, b) => Number(a.ts) - Number(b.ts));

  const reviewedRows = rows.filter((r) => r.reviewed);

  // --- Attribute -----------------------------------------------------------
  const counts = new Map<string, number>();
  for (const row of reviewedRows) {
    for (const id of row.reviewerIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const resolve = makeUserResolver(token);
  const reviewers: ReviewerTally[] = [];
  for (const [id, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    reviewers.push({ id, name: displayName(await resolve(id), id), count });
  }
  const attributions = reviewers.reduce((sum, r) => sum + r.count, 0);

  // --- Group ---------------------------------------------------------------
  const tally = (label: string, subset: ReviewRow[]): GroupTally => {
    const perReviewer: Record<string, number> = {};
    let total = 0;
    for (const reviewer of reviewers) {
      const n = subset.filter((r) => r.reviewerIds.includes(reviewer.id)).length;
      perReviewer[reviewer.id] = n;
      total += n;
    }
    return { label, total, perReviewer };
  };

  const byWeek = [...new Set(reviewedRows.map((r) => r.week))]
    .sort()
    .map((week) => tally(week, reviewedRows.filter((r) => r.week === week)));

  const byChannel = SALES_CHANNELS
    .map((c) => tally(c.name, reviewedRows.filter((r) => r.channelId === c.id)))
    .filter((t) => t.total > 0);

  // --- Notes: everything that could make these numbers wrong ---------------
  const notes: string[] = [];
  if (skipped.length) {
    notes.push(
      `Couldn't read ${skipped.length} channel(s), so their reviews are missing: ` +
        `${skipped.map((s) => `#${s.channel} (${s.why})`).join(', ')}.`,
    );
  }
  if (unusable) {
    notes.push(
      `${unusable} message(s) had an unreadable timestamp and were skipped. ` +
        `That shouldn't happen — worth a look if it's more than a stray one or two.`,
    );
  }
  const truncatedCount = rows.filter((r) => r.truncated).length;
  if (truncatedCount) {
    notes.push(
      `${truncatedCount} message(s) had more reactors than Slack would list, so those may undercount.`,
    );
  }
  const otherCounts = new Map<string, number>();
  for (const row of rows.filter((r) => !r.reviewed)) {
    for (const name of row.otherReactions) {
      otherCounts.set(name, (otherCounts.get(name) ?? 0) + 1);
    }
  }
  const topOther = [...otherCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (topOther.length) {
    notes.push(
      `Requests with no ❤️ most often carry these instead: ` +
        `${topOther.map(([n, c]) => `:${n}: ×${c}`).join(', ')}. ` +
        `If the team has switched emoji, REVIEW_EMOJI in src/lib/review-attribution.ts needs updating.`,
    );
  }
  notes.push(
    'Counts top-level channel messages only. A review request posted as a reply inside ' +
      'another thread is not counted (spot-checks put that under 1%).',
  );

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    windowLabel: `${fmt(opts.since)} → ${fmt(opts.until)}`,
    since: fmt(opts.since),
    until: fmt(opts.until),
    total: rows.length,
    reviewedCount: reviewedRows.length,
    unreviewedCount: rows.length - reviewedRows.length,
    attributions,
    reviewers,
    byWeek,
    byChannel,
    notes,
    rows,
    apiCalls,
  };
}

/** Share as a rounded percentage string, or an em dash when there's no data. */
export function share(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

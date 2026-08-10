#!/usr/bin/env node
// ============================================================================
// Proposal-review attribution — who is reviewing the sales team's proposals?
// ============================================================================
// THE QUESTION THIS ANSWERS
//
// Each sales arborist has their own Slack channel. When their proposal is ready
// for a supervisor to look at, they post a short message that @-mentions the
// review group (e.g. "@sales-review ready", "review please", or just an
// address). A supervisor — Brent or Nic — then drops a ❤️ on that message to
// mark it reviewed. This script counts those hearts and tells you who left them.
//
// WHY A SCRIPT INSTEAD OF READING IT BY HAND
//
// Slack's UI (and the Slack MCP tools) will tell you a message got 1 heart, but
// not WHO left it — you have to open each message to see the name. Over three
// months that's ~2,500 messages, which is not something a person or a chat
// assistant can realistically get through without sampling.
//
// The raw Slack API does not have that problem. `conversations.history` returns
// each message WITH the full reaction list, including the member IDs of everyone
// who reacted:
//
//     "reactions": [ { "name": "heart", "count": 1, "users": ["U065DMEA72P"] } ]
//
// So one API call covers 200 messages, reactions included. The whole three
// months across every channel is a couple hundred calls and finishes in
// minutes — an exact census, not an estimate.
//
// USAGE
//
//   npm run review-stats                        # last 3 months
//   npm run review-stats -- --months 1          # last month
//   npm run review-stats -- --since 2026-05-11 --until 2026-08-10
//   npm run review-stats -- --include-threads   # also sweep thread replies (slow)
//   npm run review-stats -- --csv out.csv       # where to write the row-level CSV
//
// See docs/review-attribution.md for setup and for how to read the output.
//
// NOTE ON STYLE: this file is deliberately dependency-free and standalone
// (plain .mjs, not TypeScript). It re-implements a small Slack API caller
// rather than importing src/lib/slack.ts, because that module imports
// next/headers and only works inside the Next.js server. Keeping this script
// self-contained means it runs with a bare `node` and no build step.
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';

// ---------------------------------------------------------------------------
// CONFIG — edit these when the team or the convention changes
// ---------------------------------------------------------------------------

// The per-arborist sales channels. Channel IDs are stable; names are only for
// display, so renaming a channel in Slack won't break this.
//
// These are hard-coded rather than auto-discovered because auto-discovery needs
// the `groups:read` scope, which our Slack app deliberately doesn't request.
// To add a new arborist: open their channel in Slack, View channel details, and
// copy the Channel ID from the bottom of that panel.
const SALES_CHANNELS = [
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

// The Slack user-group ("@-group") the arborists mention to ask for a review.
// In message text a group mention looks like `<!subteam^S0911Q0HTDF>`, so that
// substring is the most reliable way to spot a review request — far more robust
// than matching words, since people write "ready", "review please", an address,
// or nothing at all.
const REVIEW_SUBTEAM_ID = 'S0911Q0HTDF';

// The reaction(s) that mean "I reviewed this."
const REVIEW_EMOJI = ['heart'];

// Everything is bucketed by Twin Cities local time, so a 5pm review lands on
// the day it actually happened for the team.
const TIMEZONE = 'America/Chicago';

// Whose stored Slack token to borrow when one isn't supplied directly. The
// token acts AS this person, so they must be a member of the sales channels.
const DEFAULT_TOKEN_OWNER = 'molly@bratttree.com';

const SLACK_API = 'https://slack.com/api';

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * Loads .env.local into process.env without pulling in a dotenv dependency.
 * Only fills variables that aren't already set, so real env vars always win.
 */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip matching surrounding quotes, if present.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

/** Mirrors decrypt() in src/lib/crypto.ts — AES-256-GCM, `iv:tag:ciphertext`. */
function decryptToken(payload) {
  const rawKey = process.env.SLACK_TOKEN_ENC_KEY;
  if (!rawKey) throw new Error('SLACK_TOKEN_ENC_KEY is not set.');
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `SLACK_TOKEN_ENC_KEY must decode to 32 bytes (got ${key.length}).`,
    );
  }
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted token.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** YYYY-MM-DD for a Unix-seconds timestamp, in Twin Cities local time. */
function localDate(tsSeconds) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(tsSeconds * 1000));
}

/** Short weekday name (Mon…Sun) in Twin Cities local time. */
function localWeekday(tsSeconds) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
  }).format(new Date(tsSeconds * 1000));
}

/**
 * The Monday (YYYY-MM-DD) of the week a timestamp falls in. Used to group the
 * output by week, which is the level the reviewer split actually varies at —
 * coverage tends to run in multi-day blocks, not day by day.
 */
function weekStart(tsSeconds) {
  const [y, m, d] = localDate(tsSeconds).split('-').map(Number);
  // Build a UTC date from the LOCAL calendar date so day-of-week arithmetic
  // can't be knocked off by the timezone offset.
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const backToMonday = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - backToMonday);
  return date.toISOString().slice(0, 10);
}

function pct(part, whole) {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** Renders an array of objects as an aligned text table. */
function table(rows, columns) {
  if (!rows.length) return '  (none)';
  const widths = columns.map((col) =>
    Math.max(col.label.length, ...rows.map((r) => String(col.value(r)).length)),
  );
  const line = (cells) =>
    '  ' +
    cells
      .map((cell, i) => (columns[i].align === 'right'
        ? String(cell).padStart(widths[i])
        : String(cell).padEnd(widths[i])))
      .join('  ');
  return [
    line(columns.map((c) => c.label)),
    '  ' + widths.map((w) => '─'.repeat(w)).join('  '),
    ...rows.map((r) => line(columns.map((c) => c.value(r)))),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    months: 3,
    since: null,
    until: null,
    includeThreads: false,
    csv: null,
    owner: process.env.SLACK_TOKEN_OWNER || DEFAULT_TOKEN_OWNER,
    emoji: REVIEW_EMOJI,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${arg} needs a value.`);
      return v;
    };
    switch (arg) {
      case '--months': opts.months = Number(next()); break;
      case '--since': opts.since = next(); break;
      case '--until': opts.until = next(); break;
      case '--include-threads': opts.includeThreads = true; break;
      case '--csv': opts.csv = next(); break;
      case '--owner': opts.owner = next(); break;
      case '--emoji': opts.emoji = next().split(',').map((s) => s.trim()); break;
      case '--help': case '-h':
        console.log(readFileSync(new URL(import.meta.url)).toString()
          .split('\n')
          .filter((l) => l.startsWith('//'))
          .map((l) => l.replace(/^\/\/ ?/, ''))
          .join('\n'));
        process.exit(0);
        break;
      default:
        fail(`Unknown option: ${arg}  (try --help)`);
    }
  }
  if (!Number.isFinite(opts.months) || opts.months <= 0) {
    fail('--months must be a positive number.');
  }
  for (const [flag, value] of [['--since', opts.since], ['--until', opts.until]]) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      fail(`${flag} must look like YYYY-MM-DD (got "${value}").`);
    }
  }
  return opts;
}

/** Resolves the requested window to inclusive Unix-second bounds. */
function resolveWindow(opts) {
  const until = opts.until ? new Date(`${opts.until}T23:59:59Z`) : new Date();
  let since;
  if (opts.since) {
    since = new Date(`${opts.since}T00:00:00Z`);
  } else {
    since = new Date(until);
    since.setUTCMonth(since.getUTCMonth() - opts.months);
  }
  if (since >= until) fail('--since must be before --until.');
  return {
    oldest: Math.floor(since.getTime() / 1000),
    latest: Math.floor(until.getTime() / 1000),
    label: `${since.toISOString().slice(0, 10)} → ${until.toISOString().slice(0, 10)}`,
  };
}

// ---------------------------------------------------------------------------
// Slack API
// ---------------------------------------------------------------------------

let apiCallCount = 0;

async function slackApi(token, method, params) {
  for (let attempt = 0; ; attempt++) {
    apiCallCount++;
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: new URLSearchParams(params),
    });

    // Slack asks us to wait when we're going too fast. Honour Retry-After.
    if (res.status === 429) {
      if (attempt >= 5) throw new Error('Slack kept rate-limiting us (gave up after 5 tries).');
      const wait = parseInt(res.headers.get('retry-after') || '5', 10);
      await sleep((wait + 1) * 1000);
      continue;
    }

    let data;
    try {
      data = await res.json();
    } catch {
      if (attempt >= 3) throw new Error(`Slack returned a non-JSON response (HTTP ${res.status}).`);
      await sleep(2000);
      continue;
    }

    if (!data.ok) {
      if (data.error === 'ratelimited' && attempt < 5) {
        await sleep(5000);
        continue;
      }
      const err = new Error(`Slack API error on ${method}: ${data.error}`);
      err.slackCode = data.error;
      throw err;
    }
    return data;
  }
}

/**
 * Pulls every top-level message in a channel inside the window, following
 * Slack's cursor pagination. 200 messages per call, reactions included.
 */
async function fetchChannelHistory(token, channelId, oldest, latest) {
  const messages = [];
  let cursor;
  do {
    const params = {
      channel: channelId,
      oldest: String(oldest),
      latest: String(latest),
      inclusive: 'true',
      limit: '200',
    };
    if (cursor) params.cursor = cursor;
    const data = await slackApi(token, 'conversations.history', params);
    messages.push(...(data.messages ?? []));
    cursor = data.response_metadata?.next_cursor || undefined;
    if (cursor) await sleep(300); // stay comfortably inside the rate limit
  } while (cursor);
  return messages;
}

/** Pulls a thread's replies (parent included). */
async function fetchThreadReplies(token, channelId, threadTs) {
  const messages = [];
  let cursor;
  do {
    const params = { channel: channelId, ts: threadTs, limit: '200' };
    if (cursor) params.cursor = cursor;
    const data = await slackApi(token, 'conversations.replies', params);
    messages.push(...(data.messages ?? []));
    cursor = data.response_metadata?.next_cursor || undefined;
    if (cursor) await sleep(300);
  } while (cursor);
  return messages;
}

/** Member ID → display name, looked up once each. */
function makeUserResolver(token) {
  const cache = new Map();
  return async function resolve(userId) {
    if (!userId) return 'Unknown';
    if (cache.has(userId)) return cache.get(userId);
    let name = userId;
    try {
      const data = await slackApi(token, 'users.info', { user: userId });
      const u = data.user ?? {};
      name = u.profile?.real_name || u.real_name || u.profile?.display_name || userId;
    } catch {
      // Leave the raw ID as the name — better than crashing the whole report.
    }
    cache.set(userId, name);
    return name;
  };
}

// ---------------------------------------------------------------------------
// Getting a token
// ---------------------------------------------------------------------------

/**
 * Two ways in, in order of preference:
 *   1. SLACK_USER_TOKEN in the environment — simplest, no database needed.
 *   2. The token the owner already granted the /tags board, pulled from the
 *      slack_connections table and decrypted. Needs the Supabase service-role
 *      key and SLACK_TOKEN_ENC_KEY, both of which are already in .env.local.
 */
async function getToken(ownerEmail) {
  if (process.env.SLACK_USER_TOKEN) {
    console.log('→ Using SLACK_USER_TOKEN from the environment.');
    return process.env.SLACK_USER_TOKEN;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail(
      'No Slack token available.\n\n' +
      '  Either set SLACK_USER_TOKEN in .env.local, or make sure .env.local has\n' +
      '  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SLACK_TOKEN_ENC_KEY\n' +
      '  so this script can borrow the token you already gave the /tags board.\n\n' +
      '  See docs/review-attribution.md.',
    );
  }

  const endpoint =
    `${url}/rest/v1/slack_connections` +
    `?select=owner_email,access_token_encrypted,scopes` +
    `&owner_email=eq.${encodeURIComponent(ownerEmail)}`;
  const res = await fetch(endpoint, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) {
    fail(`Couldn't read slack_connections from Supabase (HTTP ${res.status}).`);
  }
  const rows = await res.json();
  if (!rows.length) {
    fail(
      `No stored Slack connection for ${ownerEmail}.\n\n` +
      `  Fix: sign in to the dashboard as ${ownerEmail}, open /tags, and click\n` +
      `  "Connect Slack". Then re-run this. Or pass --owner <someone-else@bratttree.com>.`,
    );
  }
  if (!String(rows[0].scopes ?? '').includes('groups:history')) {
    console.warn(
      '⚠ The stored token is missing the groups:history scope, so private\n' +
      '  channels will fail. Reconnect Slack from /tags to refresh its scopes.',
    );
  }
  console.log(`→ Using ${ownerEmail}'s stored Slack token.`);
  return decryptToken(rows[0].access_token_encrypted);
}

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

const isReviewRequest = (msg) =>
  typeof msg.text === 'string' && msg.text.includes(`<!subteam^${REVIEW_SUBTEAM_ID}>`);

/**
 * A Slack `ts` is "seconds.microseconds" and doubles as the message ID. Guard
 * against anything unparseable: one weird message should be reported and
 * skipped, never take down a whole three-month report.
 */
const hasUsableTs = (msg) => Number.isFinite(Number(msg?.ts));

/** One row per review request, with who reviewed it (if anyone). */
function toRow(msg, channel, reviewEmoji) {
  const ts = Number(msg.ts);
  const reactions = msg.reactions ?? [];
  const reviewReactions = reactions.filter((r) => reviewEmoji.includes(r.name));

  // Slack truncates the `users` array on reactions with a great many reactors.
  // Our review hearts are almost always count:1, but flag any mismatch rather
  // than quietly attributing fewer reviewers than actually reacted.
  const truncated = reviewReactions.some(
    (r) => (r.users?.length ?? 0) < (r.count ?? 0),
  );

  const reviewerIds = [...new Set(reviewReactions.flatMap((r) => r.users ?? []))];

  return {
    channel: channel.name,
    channelId: channel.id,
    ts: msg.ts,
    date: localDate(ts),
    weekday: localWeekday(ts),
    week: weekStart(ts),
    authorId: msg.user ?? '',
    reviewerIds,
    reviewed: reviewerIds.length > 0,
    truncated,
    // Every non-review reaction present, so a change of convention (someone
    // switching to ✅) shows up in the report instead of vanishing.
    otherReactions: reactions
      .filter((r) => !reviewEmoji.includes(r.name))
      .map((r) => r.name),
    permalink: `https://bratttree.slack.com/archives/${channel.id}/p${msg.ts.replace('.', '')}`,
    text: (msg.text ?? '').replace(/\s+/g, ' ').slice(0, 120),
  };
}

async function main() {
  loadEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  const window = resolveWindow(opts);
  const token = await getToken(opts.owner);
  const resolveName = makeUserResolver(token);

  console.log(`\nProposal-review attribution`);
  console.log(`Window: ${window.label}`);
  console.log(`Review request = a message mentioning the @-group ${REVIEW_SUBTEAM_ID}`);
  console.log(`Reviewed = carries :${opts.emoji.join(': / :')}:`);
  console.log(`Channels: ${SALES_CHANNELS.length}`);
  console.log(opts.includeThreads
    ? 'Scope: top-level messages AND thread replies (slower, exhaustive)\n'
    : 'Scope: top-level messages only (add --include-threads for an exhaustive sweep)\n');

  const rows = [];
  const skipped = [];
  let unusable = 0; // messages whose timestamp Slack sent malformed

  for (const channel of SALES_CHANNELS) {
    process.stdout.write(`  ${channel.name.padEnd(18)}`);
    let messages;
    try {
      messages = await fetchChannelHistory(token, channel.id, window.oldest, window.latest);
    } catch (err) {
      // A channel the token owner isn't in, or that was archived/renamed away,
      // shouldn't kill the whole report — note it and carry on.
      const why = err.slackCode ?? err.message;
      skipped.push({ channel: channel.name, why });
      console.log(`skipped (${why})`);
      continue;
    }

    let found = messages.filter(isReviewRequest);

    if (opts.includeThreads) {
      // Review requests are occasionally posted as a reply inside an existing
      // thread, where conversations.history can't see them. Sweeping every
      // thread is the only way to catch those, and it costs one extra call per
      // thread — hence opt-in.
      const threadParents = messages.filter((m) => (m.reply_count ?? 0) > 0);
      const seen = new Set(found.map((m) => m.ts));
      for (const parent of threadParents) {
        try {
          const replies = await fetchThreadReplies(token, channel.id, parent.thread_ts ?? parent.ts);
          for (const reply of replies) {
            const ts = Number(reply.ts);
            if (ts < window.oldest || ts > window.latest) continue;
            if (seen.has(reply.ts) || !isReviewRequest(reply)) continue;
            seen.add(reply.ts);
            found.push(reply);
          }
        } catch {
          // Ignore a single unreadable thread.
        }
        await sleep(150);
      }
    }

    const usable = found.filter(hasUsableTs);
    unusable += found.length - usable.length;
    for (const msg of usable) rows.push(toRow(msg, channel, opts.emoji));
    console.log(`${String(usable.length).padStart(4)} review requests`);
  }

  if (!rows.length) {
    fail(
      'No review requests found in that window.\n\n' +
      `  Check that REVIEW_SUBTEAM_ID (${REVIEW_SUBTEAM_ID}) is still the group\n` +
      '  the arborists mention, and that the channel list is current.',
    );
  }

  // --- Attribute -----------------------------------------------------------
  const reviewed = rows.filter((r) => r.reviewed);
  const byReviewer = new Map(); // member ID → count
  for (const row of reviewed) {
    // A message with two hearts counts once for each reviewer; that's rare but
    // it means the reviewer totals can exceed the reviewed-message count, so
    // percentages below are taken over total ATTRIBUTIONS, not messages.
    for (const id of row.reviewerIds) {
      byReviewer.set(id, (byReviewer.get(id) ?? 0) + 1);
    }
  }
  const totalAttributions = [...byReviewer.values()].reduce((a, b) => a + b, 0);

  const reviewerRows = await Promise.all(
    [...byReviewer.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(async ([id, count]) => ({
        name: await resolveName(id),
        id,
        count,
        share: pct(count, totalAttributions),
      })),
  );

  // --- Report --------------------------------------------------------------
  console.log(`\n${'='.repeat(64)}`);
  console.log('WHO REVIEWED WHAT');
  console.log('='.repeat(64));
  console.log(`\nReview requests found:      ${rows.length}`);
  console.log(`  reviewed (has the emoji): ${reviewed.length}  (${pct(reviewed.length, rows.length)})`);
  console.log(`  no review emoji:          ${rows.length - reviewed.length}  (${pct(rows.length - reviewed.length, rows.length)})`);

  console.log(`\nShare of the ${totalAttributions} completed reviews:\n`);
  console.log(table(reviewerRows, [
    { label: 'Reviewer', value: (r) => r.name },
    { label: 'Reviews', value: (r) => r.count, align: 'right' },
    { label: 'Share', value: (r) => r.share, align: 'right' },
  ]));

  // Week by week — this is where the split actually moves, because coverage
  // runs in multi-day blocks rather than evening out day to day.
  const topTwo = reviewerRows.slice(0, 2);
  if (topTwo.length === 2) {
    const [a, b] = topTwo;
    const otherIds = reviewerRows.slice(2).map((r) => r.id);
    const hasOthers = otherIds.length > 0;

    // NOTE: these tables count ATTRIBUTIONS, not messages, so the reviewer
    // columns always sum to the total. They differ only when one message was
    // hearted by two people, which is rare — but counting messages would make
    // the columns overshoot the total and look like an arithmetic error.
    const breakdown = (subset) => {
      const aCount = subset.filter((r) => r.reviewerIds.includes(a.id)).length;
      const bCount = subset.filter((r) => r.reviewerIds.includes(b.id)).length;
      const otherCount = subset.filter((r) =>
        r.reviewerIds.some((id) => otherIds.includes(id)),
      ).length;
      return { aCount, bCount, otherCount, total: aCount + bCount + otherCount };
    };

    const columns = (firstLabel, firstValue) => [
      { label: firstLabel, value: firstValue },
      { label: 'Reviews', value: (r) => r.total, align: 'right' },
      { label: a.name.split(' ')[0], value: (r) => r.aCount, align: 'right' },
      { label: b.name.split(' ')[0], value: (r) => r.bCount, align: 'right' },
      ...(hasOthers
        ? [{ label: 'Other', value: (r) => r.otherCount, align: 'right' }]
        : []),
      {
        label: `${b.name.split(' ')[0]} %`,
        value: (r) => pct(r.bCount, r.total),
        align: 'right',
      },
    ];

    const weeks = [...new Set(reviewed.map((r) => r.week))].sort();
    const weekRows = weeks.map((week) => ({
      week,
      ...breakdown(reviewed.filter((r) => r.week === week)),
    }));
    console.log(`\nBy week (Monday start, Twin Cities time):\n`);
    console.log(table(weekRows, columns('Week of', (r) => r.week)));

    // Per channel, so you can see whether a supervisor is concentrated on
    // particular arborists rather than covering across the board.
    const channelRows = SALES_CHANNELS
      .map((c) => ({
        channel: c.name,
        ...breakdown(reviewed.filter((r) => r.channelId === c.id)),
      }))
      .filter((r) => r.total > 0);
    console.log(`\nBy channel:\n`);
    console.log(table(channelRows, columns('Channel', (r) => r.channel)));
  }

  // --- Things worth knowing about the data --------------------------------
  const notes = [];
  if (unusable) {
    notes.push(`${unusable} message(s) had an unreadable timestamp and were skipped. That shouldn't happen — worth a look if the number is more than a stray one or two.`);
  }
  const truncatedCount = rows.filter((r) => r.truncated).length;
  if (truncatedCount) {
    notes.push(`${truncatedCount} message(s) had more reactors than Slack listed — those rows may undercount. Flagged as "truncated" in the CSV.`);
  }
  const otherReactionCounts = new Map();
  for (const row of rows.filter((r) => !r.reviewed)) {
    for (const name of row.otherReactions) {
      otherReactionCounts.set(name, (otherReactionCounts.get(name) ?? 0) + 1);
    }
  }
  const topOther = [...otherReactionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topOther.length) {
    notes.push(
      `Unreviewed requests most often carry these other reactions instead: ` +
      topOther.map(([n, c]) => `:${n}: ×${c}`).join(', ') +
      `. If the team has switched emoji, re-run with --emoji <name>.`,
    );
  }
  if (!opts.includeThreads) {
    notes.push('Top-level messages only. Review requests posted as a reply inside another thread are not counted — run with --include-threads for an exhaustive sweep.');
  }
  if (skipped.length) {
    notes.push(`Channels skipped: ${skipped.map((s) => `${s.channel} (${s.why})`).join(', ')}.`);
  }
  if (notes.length) {
    console.log(`\nNotes / limits of this run:`);
    for (const note of notes) console.log(`  • ${note}`);
  }

  // --- CSV ----------------------------------------------------------------
  const csvPath = opts.csv ?? `review-attribution-${window.label.replace(/ → /, '_to_')}.csv`;
  const reviewerNames = new Map();
  for (const id of byReviewer.keys()) reviewerNames.set(id, await resolveName(id));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['channel', 'date', 'weekday', 'week_of', 'reviewed', 'reviewers', 'truncated', 'other_reactions', 'text', 'permalink']
      .join(','),
    ...rows
      .sort((a, b) => Number(a.ts) - Number(b.ts))
      .map((r) => [
        r.channel,
        r.date,
        r.weekday,
        r.week,
        r.reviewed ? 'yes' : 'no',
        r.reviewerIds.map((id) => reviewerNames.get(id) ?? id).join('; '),
        r.truncated ? 'yes' : '',
        r.otherReactions.join('; '),
        r.text,
        r.permalink,
      ].map(esc).join(',')),
  ].join('\n');
  writeFileSync(csvPath, csv);

  console.log(`\nRow-level detail (every request, with a clickable Slack link):`);
  console.log(`  ${csvPath}`);
  console.log(`\nDone — ${apiCallCount} Slack API calls.\n`);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  if (err.slackCode === 'missing_scope') {
    console.error(
      '\n  The Slack token lacks a scope this needs (groups:history for private\n' +
      '  channels, users:read for names). Reconnect Slack from /tags to refresh.',
    );
  }
  if (err.slackCode === 'not_in_channel') {
    console.error(
      '\n  The token owner is not a member of one of the sales channels. Either\n' +
      '  join it in Slack, or pass --owner for someone who is in all of them.',
    );
  }
  console.error('');
  process.exit(1);
});

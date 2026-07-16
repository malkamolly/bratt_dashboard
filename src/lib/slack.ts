// ============================================================================
// Slack API client + OAuth + token storage — SERVER ONLY.
// ============================================================================
// Everything that talks to Slack lives here. Two halves:
//
//   1. OAuth: we use Slack's "user token" flow (not a bot token). A user token
//      (xoxp-…) acts AS the person who authorized it, so it sees exactly the
//      channels and DMs they see — nothing more, nothing less. A bot token
//      would miss private channels and can't read DMs at all, so it would miss
//      most of the tags that actually matter. Read-only scopes only in v1.
//
//   2. The API caller + the three reads the board needs: search for the user's
//      own mentions, pull a thread's messages, and resolve a user (to get a
//      display name and to tell humans from bots).
//
// Tokens are stored encrypted (see src/lib/crypto.ts) and gated per-user by
// RLS (see migration 059). The token never leaves the server.
// ============================================================================

import { serverClient } from './supabase';
import { encrypt, decrypt } from './crypto';

// User-token scopes, minimal for a read-only v1. If you change this list you
// must also update it in the Slack app config, and connected users must
// re-authorize to pick up the new scopes.
export const SLACK_USER_SCOPES = [
  'search:read', // run the tagged-message search
  'channels:history', // read public-channel thread context
  'groups:history', // …private channels
  'im:history', // …DMs
  'mpim:history', // …group DMs
  'users:read', // resolve names + detect bot authors
  'chat:write', // post replies back into a thread (as the user)
  'reactions:write', // mark a message Handled with our reaction
].join(',');

// The reaction dropped on a message when it's marked Handled. Deliberately an
// obscure, on-brand mark (a Bratt-orange diamond) so a reaction from this tool
// is unmistakable and won't be confused with the ubiquitous ✅. Swap this for a
// custom workspace emoji name (e.g. 'bratt-handled') for a truly unique mark.
export const HANDLED_REACTION = 'large_orange_diamond';

const SLACK_API = 'https://slack.com/api';

// ---------------------------------------------------------------------------
// Types (only the fields we actually use)
// ---------------------------------------------------------------------------

export type SlackSearchMatch = {
  ts: string;
  text: string;
  user?: string; // author's member ID (absent for some bot messages)
  username?: string;
  bot_id?: string; // present when the author is a bot / app
  reply_count?: number; // thread replies, when the search result includes it
  permalink?: string;
  thread_ts?: string;
  channel?: { id: string; name?: string; is_private?: boolean; is_im?: boolean };
};

export type SlackMessage = {
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  thread_ts?: string;
  reactions?: { name: string; count: number; users?: string[] }[];
};

export type SlackUser = {
  id: string;
  is_bot?: boolean;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string };
};

export type SlackConnection = {
  ownerEmail: string;
  slackUserId: string;
  token: string; // decrypted — never persist or log this
  scopes: string;
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** Builds the Slack "Authorize" URL the user is sent to, to grant access. */
export function authorizeUrl(redirectUri: string, state: string): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error('SLACK_CLIENT_ID is not set.');
  const params = new URLSearchParams({
    client_id: clientId,
    // NOTE: user_scope (not scope) — this is what makes it a user-token flow.
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchanges the temporary `code` Slack hands back for a real user token.
 * Returns the token + the member ID it belongs to.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ token: string; slackUserId: string; scopes: string }> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SLACK_CLIENT_ID / SLACK_CLIENT_SECRET are not set.');
  }

  const res = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'unknown_error'}`);
  }
  // In the v2 flow the USER token lives under authed_user (the top-level
  // access_token, when present, is the bot token, which we don't want).
  const authed = data.authed_user;
  if (!authed?.access_token || !authed?.id) {
    throw new Error('Slack OAuth response did not include a user token.');
  }
  return {
    token: authed.access_token,
    slackUserId: authed.id,
    scopes: authed.scope ?? '',
  };
}

// ---------------------------------------------------------------------------
// Token storage (per-user, encrypted)
// ---------------------------------------------------------------------------

export async function storeConnection(
  ownerEmail: string,
  slackUserId: string,
  token: string,
  scopes: string,
): Promise<void> {
  const supabase = await serverClient();
  await supabase.from('slack_connections').upsert(
    {
      owner_email: ownerEmail,
      slack_user_id: slackUserId,
      access_token_encrypted: encrypt(token),
      scopes,
    },
    { onConflict: 'owner_email' },
  );
}

/** Returns the user's connection (with a DECRYPTED token) or null. */
export async function getConnection(
  ownerEmail: string,
): Promise<SlackConnection | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_connections')
    .select('owner_email, slack_user_id, access_token_encrypted, scopes')
    .eq('owner_email', ownerEmail)
    .maybeSingle();
  if (!data) return null;
  return {
    ownerEmail: data.owner_email,
    slackUserId: data.slack_user_id,
    token: decrypt(data.access_token_encrypted),
    scopes: data.scopes ?? '',
  };
}

export async function deleteConnection(ownerEmail: string): Promise<void> {
  const supabase = await serverClient();
  await supabase.from('slack_connections').delete().eq('owner_email', ownerEmail);
}

// ---------------------------------------------------------------------------
// API caller
// ---------------------------------------------------------------------------

/** Thrown when Slack replies with ok:false, so callers can react by error code. */
export class SlackApiError extends Error {
  constructor(public code: string) {
    super(`Slack API error: ${code}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function slackApi<T = unknown>(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  // Slack's search API is aggressively rate-limited; under load it answers with
  // HTTP 429 (or ok:false "ratelimited"). Retry a couple of times with a short,
  // capped wait so a throttle doesn't turn into an empty board. The cap keeps
  // us well under the serverless function timeout rather than honoring a long
  // Retry-After.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    });

    if (res.status === 429 && attempt < 2) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
      await sleep(Math.min(retryAfter, 4) * 1000);
      continue;
    }

    // A 429 with no JSON body would make res.json() throw; guard against it.
    let data: { ok?: boolean; error?: string };
    try {
      data = await res.json();
    } catch {
      if (attempt < 2) {
        await sleep(2000);
        continue;
      }
      throw new SlackApiError('ratelimited');
    }

    if (!data.ok) {
      if (data.error === 'ratelimited' && attempt < 2) {
        await sleep(2000);
        continue;
      }
      throw new SlackApiError(data.error ?? 'unknown_error');
    }
    return data as T;
  }
}

/**
 * Searches for messages that mention the user, newest first. The proven query
 * is the user's own member ID in angle-bracket form (`<@U123>`) — Slack's
 * `to:me` did not surface the right results in testing, but the member-ID
 * mention search did.
 */
export async function searchMessages(
  token: string,
  term: string,
  opts: { after?: string; before?: string; count?: number } = {},
): Promise<SlackSearchMatch[]> {
  const { after, before, count = 100 } = opts;
  // Bound the search to a date window when given (Slack's after:/before: take
  // YYYY-MM-DD). The caller trims to the exact week afterward.
  const query = [term, after ? `after:${after}` : '', before ? `before:${before}` : '']
    .filter(Boolean)
    .join(' ');

  const data = await slackApi<{ messages?: { matches?: SlackSearchMatch[] } }>(
    token,
    'search.messages',
    { query, sort: 'timestamp', sort_dir: 'desc', count: String(count) },
  );
  return data.messages?.matches ?? [];
}

/** Convenience: search for messages that mention the given user. */
export function searchMentions(
  token: string,
  slackUserId: string,
  opts: { after?: string; before?: string; count?: number } = {},
): Promise<SlackSearchMatch[]> {
  return searchMessages(token, `<@${slackUserId}>`, opts);
}

/**
 * Pulls a thread's messages (parent + replies) so the bucketer can see what
 * happened AFTER the user's own reply. `ts` is the message we found in search;
 * Slack resolves it to its thread. A message with no replies comes back as a
 * one-element array, which is exactly what we want (no reply yet).
 */
export async function fetchThread(
  token: string,
  channelId: string,
  ts: string,
): Promise<SlackMessage[]> {
  const data = await slackApi<{ messages?: SlackMessage[] }>(
    token,
    'conversations.replies',
    { channel: channelId, ts, limit: '200' },
  );
  return data.messages ?? [];
}

/**
 * Posts a reply into a thread, AS the connected user. `threadTs` is the thread
 * root so the message lands in the right conversation rather than as a new
 * top-level post. Requires the chat:write scope (added in v2 — users who
 * connected before it must reconnect to grant it).
 */
export async function postReply(
  token: string,
  channelId: string,
  threadTs: string,
  text: string,
): Promise<void> {
  await slackApi(token, 'chat.postMessage', {
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}

/**
 * Add / remove a reaction on a message (as the user). Best-effort: callers
 * treat failures (already reacted, message gone, etc.) as non-fatal.
 */
export async function addReaction(
  token: string,
  channelId: string,
  ts: string,
  name: string,
): Promise<void> {
  await slackApi(token, 'reactions.add', { channel: channelId, timestamp: ts, name });
}

export async function removeReaction(
  token: string,
  channelId: string,
  ts: string,
  name: string,
): Promise<void> {
  await slackApi(token, 'reactions.remove', { channel: channelId, timestamp: ts, name });
}

/**
 * Pulls channel messages posted at/after `oldestTs`. Used to catch the common
 * case where someone replies as a NEW channel message instead of threading
 * their reply — the thread would look empty, but the reply is right there in
 * the channel timeline. Bounded by `limit` to keep it cheap.
 */
export async function fetchChannelAfter(
  token: string,
  channelId: string,
  oldestTs: string,
  limit = 40,
): Promise<SlackMessage[]> {
  const data = await slackApi<{ messages?: SlackMessage[] }>(
    token,
    'conversations.history',
    { channel: channelId, oldest: oldestTs, inclusive: 'false', limit: String(limit) },
  );
  return data.messages ?? [];
}

/**
 * Resolves a member ID to a user record (name + is_bot), memoized within a
 * single board build so we never look the same person up twice.
 */
export function makeUserResolver(token: string) {
  const cache = new Map<string, SlackUser | null>();
  return async function resolve(userId: string): Promise<SlackUser | null> {
    if (cache.has(userId)) return cache.get(userId)!;
    try {
      const data = await slackApi<{ user?: SlackUser }>(token, 'users.info', {
        user: userId,
      });
      const user = data.user ?? null;
      cache.set(userId, user);
      return user;
    } catch {
      cache.set(userId, null);
      return null;
    }
  };
}

export function displayName(user: SlackUser | null, fallback?: string): string {
  return (
    user?.profile?.display_name ||
    user?.profile?.real_name ||
    user?.real_name ||
    fallback ||
    'Someone'
  );
}

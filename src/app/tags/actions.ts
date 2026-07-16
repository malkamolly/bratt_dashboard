'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAllowedUser } from '@/lib/auth';
import { isTagsUser } from '@/lib/tags-config';
import { serverClient } from '@/lib/supabase';
import {
  addReaction,
  deleteConnection,
  getConnection,
  HANDLED_REACTION,
  postReply,
  removeReaction,
  SlackApiError,
} from '@/lib/slack';
import {
  buildBoard,
  composeBoard,
  emptyBoard,
  weekBounds,
  type MessageAction,
  type TriageBoard,
  type TriageCard,
} from '@/lib/slack-triage';

// Every action re-checks ownership server-side. Middleware already blocks the
// route, but a server action can be invoked directly, so we never trust the
// route guard alone. Mirrors the pattern in /projects/actions.ts.
async function requireTagsUserAction() {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isTagsUser(u.email)) redirect('/access-denied');
  return u;
}

// ---------------------------------------------------------------------------
// Reading the board (cached weekly buckets + persistent overrides)
// ---------------------------------------------------------------------------

/** The raw, auto-sorted weekly board as last fetched, or null if none cached. */
async function readCachedBoard(ownerEmail: string): Promise<TriageBoard | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_triage_cache')
    .select('board')
    .eq('owner_email', ownerEmail)
    .maybeSingle();
  return (data?.board as TriageBoard) ?? null;
}

/** The set of message ids the user marked Handled. */
async function readHandledIds(ownerEmail: string): Promise<Set<string>> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_message_actions')
    .select('message_key')
    .eq('owner_email', ownerEmail)
    .eq('action', 'handled');
  return new Set((data ?? []).map((r) => r.message_key));
}

/** The persistent Follow-up list, rebuilt from saved card snapshots. */
async function readFollowupCards(ownerEmail: string): Promise<TriageCard[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_message_actions')
    .select('card')
    .eq('owner_email', ownerEmail)
    .eq('action', 'followup');
  return (data ?? [])
    .map((r) => r.card as TriageCard | null)
    .filter((c): c is TriageCard => !!c && !!c.id);
}

/**
 * The board the user sees for a given week: the cached weekly buckets (only if
 * the cache is actually for that week) re-assembled with Handled overrides and
 * the persistent Follow-up list. Cheap (no Slack call) — used on page load and
 * after every button press.
 */
export async function getDisplayBoard(
  ownerEmail: string,
  offsetWeeks = 0,
): Promise<TriageBoard> {
  const week = weekBounds(offsetWeeks);
  const [cached, handledIds, followupCards] = await Promise.all([
    readCachedBoard(ownerEmail),
    readHandledIds(ownerEmail),
    readFollowupCards(ownerEmail),
  ]);
  // Use the cache only if it's for the week being shown; otherwise start empty
  // and let the client refresh it live.
  const weekly = cached && cached.weekStartMs === week.startMs ? cached : emptyBoard(week);
  return composeBoard(weekly, handledIds, followupCards);
}

/**
 * Hit Slack, rebuild the selected week's auto board, cache it, then return it
 * assembled with overrides + Follow-up. Called on load, the refresh button,
 * the background refresh, and when switching weeks.
 */
// Count the messages a freshly-fetched week holds (Follow-up is separate, from
// snapshots, so it's excluded here).
function weekItemCount(b: TriageBoard): number {
  return (
    (b.needs_reply?.length ?? 0) +
    (b.waiting?.length ?? 0) +
    (b.handled?.length ?? 0) +
    (b.fyi?.length ?? 0) +
    (b.groups ?? []).reduce((n, g) => n + g.cards.length, 0)
  );
}

export async function refreshBoard(offsetWeeks = 0): Promise<TriageBoard> {
  const u = await requireTagsUserAction();
  let weekly = await buildBoard(u.email, offsetWeeks);

  if (!weekly.error) {
    if (weekItemCount(weekly) > 0) {
      // Only ever persist a board that actually has content.
      const supabase = await serverClient();
      await supabase.from('slack_triage_cache').upsert(
        {
          owner_email: u.email,
          board: weekly as unknown as Record<string, unknown>,
          fetched_at: new Date(weekly.fetchedAt).toISOString(),
        },
        { onConflict: 'owner_email' },
      );
    } else {
      // An empty fetch is almost always a throttled/transient search, not a
      // genuinely empty week. Never cache it; if we have a good cached board
      // for this week, show that instead of nothing.
      const existing = await readCachedBoard(u.email);
      if (existing && existing.weekStartMs === weekly.weekStartMs && weekItemCount(existing) > 0) {
        weekly = existing;
      }
    }
  }
  const [handledIds, followupCards] = await Promise.all([
    readHandledIds(u.email),
    readFollowupCards(u.email),
  ]);
  return composeBoard(weekly, handledIds, followupCards);
}

// ---------------------------------------------------------------------------
// Manual actions on a card
// ---------------------------------------------------------------------------

/**
 * Move a card to Handled or Follow-up (persisted). Follow-up saves a snapshot
 * of the card so it survives week rollovers; Handled doesn't need one. Returns
 * the updated board for the currently-viewed week.
 */
export async function setMessageAction(
  messageKey: string,
  action: MessageAction,
  offsetWeeks = 0,
  card?: TriageCard,
): Promise<TriageBoard> {
  const u = await requireTagsUserAction();
  const supabase = await serverClient();
  await supabase.from('slack_message_actions').upsert(
    {
      owner_email: u.email,
      message_key: messageKey,
      action,
      card: action === 'followup' && card ? card : null,
    },
    { onConflict: 'owner_email,message_key' },
  );
  // Mark the message in Slack with our reaction when it's Handled; clear it
  // otherwise (e.g. re-flagged as Follow-up). Best-effort — never block on it.
  await setHandledReaction(u.email, messageKey, action === 'handled');
  return getDisplayBoard(u.email, offsetWeeks);
}

/** Clear an override so the card returns to its auto-sorted bucket. */
export async function clearMessageAction(
  messageKey: string,
  offsetWeeks = 0,
): Promise<TriageBoard> {
  const u = await requireTagsUserAction();
  const supabase = await serverClient();
  await supabase
    .from('slack_message_actions')
    .delete()
    .eq('owner_email', u.email)
    .eq('message_key', messageKey);
  await setHandledReaction(u.email, messageKey, false);
  return getDisplayBoard(u.email, offsetWeeks);
}

// Add or remove the Handled reaction on the underlying Slack message. The
// message key is "<channelId>:<ts>". Swallows all errors (already-reacted,
// no-permission, message gone) so the board action always succeeds.
async function setHandledReaction(
  ownerEmail: string,
  messageKey: string,
  on: boolean,
): Promise<void> {
  const sep = messageKey.indexOf(':');
  if (sep < 0) return;
  const channelId = messageKey.slice(0, sep);
  const ts = messageKey.slice(sep + 1);
  try {
    const conn = await getConnection(ownerEmail);
    if (!conn) return;
    if (on) await addReaction(conn.token, channelId, ts, HANDLED_REACTION);
    else await removeReaction(conn.token, channelId, ts, HANDLED_REACTION);
  } catch {
    // best-effort
  }
}

/** Post a reply into a thread as the user. Returns ok/error for the UI. */
export async function sendReply(
  channelId: string,
  threadTs: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await requireTagsUserAction();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'empty' };

  const conn = await getConnection(u.email);
  if (!conn) return { ok: false, error: 'not_connected' };

  try {
    await postReply(conn.token, channelId, threadTs, trimmed);
    return { ok: true };
  } catch (e) {
    // The most common failure is a stale token missing the new chat:write
    // scope — surface that so the UI can prompt a reconnect.
    if (e instanceof SlackApiError) {
      if (['missing_scope', 'not_authed', 'invalid_auth', 'token_revoked'].includes(e.code)) {
        return { ok: false, error: 'reauth' };
      }
      return { ok: false, error: e.code };
    }
    return { ok: false, error: 'send_failed' };
  }
}

/**
 * Forget the stored Slack token + cached board. We deliberately KEEP the user's
 * Handled/Follow-up list (slack_message_actions) — reconnecting shouldn't wipe
 * their curated follow-ups. (Granting a new scope is a reconnect, not a reset.)
 */
export async function disconnectSlack(): Promise<void> {
  const u = await requireTagsUserAction();
  await deleteConnection(u.email);
  const supabase = await serverClient();
  await supabase.from('slack_triage_cache').delete().eq('owner_email', u.email);
  revalidatePath('/tags');
}

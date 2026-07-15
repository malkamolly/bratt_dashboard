'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAllowedUser, isOwner } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { deleteConnection, getConnection, postReply, SlackApiError } from '@/lib/slack';
import {
  applyOverrides,
  buildBoard,
  emptyBoard,
  type MessageAction,
  type OverrideMap,
  type TriageBoard,
} from '@/lib/slack-triage';

// Every action re-checks ownership server-side. Middleware already blocks the
// route, but a server action can be invoked directly, so we never trust the
// route guard alone. Mirrors the pattern in /projects/actions.ts.
async function requireOwnerAction() {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isOwner(u.email)) redirect('/access-denied');
  return u;
}

// ---------------------------------------------------------------------------
// Reading the board (cache + overrides)
// ---------------------------------------------------------------------------

/** The raw, auto-sorted board as last fetched from Slack (no overrides). */
async function readCachedBoard(ownerEmail: string): Promise<TriageBoard | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_triage_cache')
    .select('board')
    .eq('owner_email', ownerEmail)
    .maybeSingle();
  return (data?.board as TriageBoard) ?? null;
}

/** The user's manual Handled / Follow-up overrides, keyed by message id. */
async function readOverrides(ownerEmail: string): Promise<OverrideMap> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_message_actions')
    .select('message_key, action')
    .eq('owner_email', ownerEmail);
  const map: OverrideMap = {};
  for (const row of data ?? []) map[row.message_key] = row.action as MessageAction;
  return map;
}

/**
 * The board as it should be shown: last cached auto-sort, re-arranged by the
 * user's overrides. Cheap (no Slack call) — used on page load and after every
 * button press so the UI updates instantly.
 */
export async function getDisplayBoard(ownerEmail: string): Promise<TriageBoard> {
  const [raw, overrides] = await Promise.all([
    readCachedBoard(ownerEmail),
    readOverrides(ownerEmail),
  ]);
  return applyOverrides(raw ?? emptyBoard(), overrides);
}

/**
 * Hit Slack, rebuild the auto board, cache it, then return it with overrides
 * applied. Called on the manual refresh button and the background refresh.
 */
export async function refreshBoard(): Promise<TriageBoard> {
  const u = await requireOwnerAction();
  const board = await buildBoard(u.email);

  // Only overwrite the cache with a genuinely fetched board. If the fetch
  // failed (e.g. token revoked) we still return the error board, but we don't
  // clobber the last-good cache with an empty one.
  if (!board.error) {
    const supabase = await serverClient();
    await supabase.from('slack_triage_cache').upsert(
      {
        owner_email: u.email,
        board: board as unknown as Record<string, unknown>,
        fetched_at: new Date(board.fetchedAt).toISOString(),
      },
      { onConflict: 'owner_email' },
    );
    const overrides = await readOverrides(u.email);
    return applyOverrides(board, overrides);
  }
  return board;
}

// ---------------------------------------------------------------------------
// Manual actions on a card
// ---------------------------------------------------------------------------

/** Move a card to Handled / Follow-up (persisted). Returns the updated board. */
export async function setMessageAction(
  messageKey: string,
  action: MessageAction,
): Promise<TriageBoard> {
  const u = await requireOwnerAction();
  const supabase = await serverClient();
  await supabase.from('slack_message_actions').upsert(
    { owner_email: u.email, message_key: messageKey, action },
    { onConflict: 'owner_email,message_key' },
  );
  return getDisplayBoard(u.email);
}

/** Clear an override so the card returns to its auto-sorted bucket. */
export async function clearMessageAction(messageKey: string): Promise<TriageBoard> {
  const u = await requireOwnerAction();
  const supabase = await serverClient();
  await supabase
    .from('slack_message_actions')
    .delete()
    .eq('owner_email', u.email)
    .eq('message_key', messageKey);
  return getDisplayBoard(u.email);
}

/** Post a reply into a thread as the user. Returns ok/error for the UI. */
export async function sendReply(
  channelId: string,
  threadTs: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = await requireOwnerAction();
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

/** Forget the stored Slack token + cached board + overrides. */
export async function disconnectSlack(): Promise<void> {
  const u = await requireOwnerAction();
  await deleteConnection(u.email);
  const supabase = await serverClient();
  await supabase.from('slack_triage_cache').delete().eq('owner_email', u.email);
  await supabase.from('slack_message_actions').delete().eq('owner_email', u.email);
  revalidatePath('/tags');
}

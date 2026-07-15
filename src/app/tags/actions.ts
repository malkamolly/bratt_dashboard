'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAllowedUser, isOwner } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { deleteConnection } from '@/lib/slack';
import { buildBoard, type TriageBoard } from '@/lib/slack-triage';

// Every action re-checks ownership server-side. Middleware already blocks the
// route, but a server action can be invoked directly, so we never trust the
// route guard alone. Mirrors the pattern in /projects/actions.ts.
async function requireOwnerAction() {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isOwner(u.email)) redirect('/access-denied');
  return u;
}

/** Read the last computed board out of the cache (fast; no Slack call). */
export async function readCachedBoard(
  ownerEmail: string,
): Promise<TriageBoard | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('slack_triage_cache')
    .select('board')
    .eq('owner_email', ownerEmail)
    .maybeSingle();
  return (data?.board as TriageBoard) ?? null;
}

/**
 * Hit Slack, rebuild the board, and cache it. Returns the fresh board so the
 * client can repaint without a full page reload. Called on the manual refresh
 * button and the optional background refresh.
 */
export async function refreshBoard(): Promise<TriageBoard> {
  const u = await requireOwnerAction();
  const board = await buildBoard(u.email);

  // Only overwrite the cache with a genuinely fetched board. If the fetch
  // failed (e.g. token revoked) we still return the error board to the client,
  // but we don't clobber the last-good cache with an empty one.
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
  }
  return board;
}

/** Forget the stored Slack token + cached board. */
export async function disconnectSlack(): Promise<void> {
  const u = await requireOwnerAction();
  await deleteConnection(u.email);
  const supabase = await serverClient();
  await supabase.from('slack_triage_cache').delete().eq('owner_email', u.email);
  revalidatePath('/tags');
}

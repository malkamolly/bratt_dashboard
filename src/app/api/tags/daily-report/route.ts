// ============================================================================
// GET /api/tags/daily-report — end-of-day summary of Juan Carlos's board,
// delivered as a Slack DM to the owner.
// ============================================================================
// Scheduled by Vercel Cron (see vercel.json) on weekday evenings. This crosses
// the normal per-user privacy boundary on purpose — it's a manager report,
// discussed in JC's PIP — so it uses the service-role client to read JC's
// stored token off-session, builds his board, and DMs the owner a summary.
//
// Auth: the cron sends `Authorization: Bearer $CRON_SECRET`. A signed-in owner
// may also hit the URL directly to test. Everyone else is rejected. The path is
// marked public in middleware (no session), so the checks here are the gate.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getAllowedUser, isOwner, OWNER_EMAIL } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { getConnectionAdmin, sendSelfDm } from '@/lib/slack';
import {
  buildBoard,
  composeBoard,
  type MessageAction,
  type TriageBoard,
  type TriageCard,
} from '@/lib/slack-triage';

// Who the report is about, and who receives it. To cover more people later,
// turn SUBJECT into a list and send one section per person.
const SUBJECT_EMAIL = 'juancarlos@bratttree.com';
const RECIPIENT_EMAIL = OWNER_EMAIL;

export async function GET(req: NextRequest) {
  // --- auth ---------------------------------------------------------------
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!isCron) {
    const u = await getAllowedUser();
    if (!u || !isOwner(u.email)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // --- deliver ------------------------------------------------------------
  const recipient = await getConnectionAdmin(RECIPIENT_EMAIL);
  if (!recipient) {
    return NextResponse.json({ error: 'recipient_not_connected' }, { status: 200 });
  }

  const text = await buildReportText();
  try {
    await sendSelfDm(recipient.token, recipient.slackUserId, text);
  } catch (e) {
    return NextResponse.json({ error: 'send_failed', detail: String(e) }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------

async function readOverridesAdmin(email: string): Promise<{
  handledIds: Set<string>;
  followupCards: TriageCard[];
}> {
  const supabase = adminClient();
  const { data } = await supabase
    .from('slack_message_actions')
    .select('message_key, action, card')
    .eq('owner_email', email);
  const handledIds = new Set<string>();
  const followupCards: TriageCard[] = [];
  for (const row of data ?? []) {
    if ((row.action as MessageAction) === 'handled') handledIds.add(row.message_key);
    else if (row.action === 'followup' && row.card) followupCards.push(row.card as TriageCard);
  }
  return { handledIds, followupCards };
}

async function buildReportText(): Promise<string> {
  const today = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());
  const header = `:memo: *Juan Carlos — end of day*  _(${today})_`;

  const conn = await getConnectionAdmin(SUBJECT_EMAIL);
  if (!conn) {
    return `${header}\nJuan Carlos hasn't connected Slack yet, so there's nothing to report.`;
  }

  const weekly = await buildBoard(SUBJECT_EMAIL, 0, conn);
  if (weekly.error) {
    return `${header}\nCouldn't read the board today (${weekly.error}). Will try again tomorrow.`;
  }

  const { handledIds, followupCards } = await readOverridesAdmin(SUBJECT_EMAIL);
  const board: TriageBoard = composeBoard(weekly, handledIds, followupCards);

  const tally =
    `*${board.needs_reply.length} need a reply* · ` +
    `${board.waiting.length} waiting · ` +
    `${board.followup.length} follow-up`;

  const lines = [header, tally];

  if (board.needs_reply.length === 0) {
    lines.push('\n:white_check_mark: Nothing left needing a reply.');
  } else {
    lines.push('\n*Still needs a reply:*');
    for (const card of board.needs_reply) {
      lines.push(`• ${formatCard(card)}`);
    }
  }
  return lines.join('\n');
}

function formatCard(card: TriageCard): string {
  const snippet = card.text.replace(/\s+/g, ' ').trim().slice(0, 140);
  const who = `${card.authorName} in ${card.channelName}`;
  const body = `${who}: "${snippet}"`;
  return card.permalink ? `<${card.permalink}|${body}>` : body;
}

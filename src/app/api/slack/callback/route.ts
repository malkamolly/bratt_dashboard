// ============================================================================
// GET /api/slack/callback — finish the Slack OAuth flow.
// ============================================================================
// Slack redirects the user's browser here with a temporary `code` and the
// `state` we sent. We verify state, trade the code for a user token, store it
// encrypted against the signed-in owner's email, then bounce back to the board.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getAllowedUser } from '@/lib/auth';
import { isTagsUser } from '@/lib/tags-config';
import { exchangeCode, storeConnection } from '@/lib/slack';

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (!isTagsUser(user.email)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  const url = req.nextUrl;
  const back = (error?: string) =>
    NextResponse.redirect(
      new URL(error ? `/tags?error=${error}` : '/tags?connected=1', req.url),
    );

  // The user can cancel on Slack's screen, which comes back with ?error=…
  if (url.searchParams.get('error')) return back('denied');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = req.cookies.get('slack_oauth_state')?.value;

  if (!code || !state || !expected || state !== expected) {
    return back('state_mismatch');
  }

  const redirectUri = new URL('/api/slack/callback', url.origin).toString();

  try {
    const { token, slackUserId, scopes } = await exchangeCode(code, redirectUri);
    await storeConnection(user.email, slackUserId, token, scopes);
  } catch {
    return back('exchange_failed');
  }

  const res = back();
  res.cookies.delete('slack_oauth_state');
  return res;
}

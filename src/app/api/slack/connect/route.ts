// ============================================================================
// GET /api/slack/connect — kick off the Slack OAuth flow.
// ============================================================================
// Sends the signed-in owner to Slack's consent screen. We stash a random
// `state` value in a short-lived, httpOnly cookie and echo it in the redirect;
// the callback checks the two match, which stops a forged callback from wiring
// someone else's Slack account to this session (CSRF protection).
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getAllowedUser } from '@/lib/auth';
import { isTagsUser } from '@/lib/tags-config';
import { authorizeUrl } from '@/lib/slack';

export async function GET(req: NextRequest) {
  const user = await getAllowedUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (!isTagsUser(user.email)) {
    return NextResponse.redirect(new URL('/access-denied', req.url));
  }

  const state = randomUUID();
  const redirectUri = new URL('/api/slack/callback', req.nextUrl.origin).toString();

  let target: string;
  try {
    target = authorizeUrl(redirectUri, state);
  } catch {
    // SLACK_CLIENT_ID not configured yet — send them back with a hint.
    return NextResponse.redirect(new URL('/tags?error=not_configured', req.url));
  }

  const res = NextResponse.redirect(target);
  res.cookies.set('slack_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes is plenty to complete consent
  });
  return res;
}

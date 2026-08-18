// ============================================================================
// Partner Hub sign-in / sign-out endpoint
// ============================================================================
// A plain HTML form POSTs here — deliberately NOT a React server action.
// Server actions carry a hidden action id that Next drops when an action
// redirects back to its own page, which silently broke the second sign-in
// attempt after a typo. A route handler has no such state: every POST is
// independent, and the form works even with JavaScript off.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  PARTNER_COOKIE,
  PARTNER_COOKIE_MAX_AGE,
  partnerPasswordMatches,
  partnerSessionToken,
} from '@/lib/partner-auth';

/** Only allow relative redirects inside /partner, so `next` can't bounce
 *  someone to another site or be used to reach an internal page. */
function safeNext(raw: unknown): string {
  const v = typeof raw === 'string' ? raw : '';
  return v.startsWith('/partner') && !v.startsWith('/partner/login')
    ? v
    : '/partner';
}

/** Error codes go in the URL, not error prose — the login page owns the wording. */
type ErrorCode = 'bad-password' | 'not-configured';

function backToLogin(req: NextRequest, code: ErrorCode, next: string) {
  const url = new URL('/partner/login', req.url);
  url.searchParams.set('error', code);
  if (next !== '/partner') url.searchParams.set('next', next);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  // Only accept our own form. Browsers always send Origin on a cross-site form
  // POST, so this blocks another site from submitting to this endpoint (which
  // could otherwise sign a visitor out, or in, without them asking).
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const form = await req.formData();
  const intent = String(form.get('intent') ?? 'signin');
  const next = safeNext(form.get('next'));

  if (intent === 'signout') {
    const res = NextResponse.redirect(new URL('/partner/login', req.url), {
      status: 303,
    });
    res.cookies.delete({ name: PARTNER_COOKIE, path: '/partner' });
    return res;
  }

  const password = String(form.get('password') ?? '');

  if (!partnerPasswordMatches(password)) {
    // Slow down repeat guessing. Not real rate limiting, but with one shared
    // password and a handful of users it's the right amount of effort.
    await new Promise((r) => setTimeout(r, 700));
    return backToLogin(req, 'bad-password', next);
  }

  const token = await partnerSessionToken();
  if (!token) return backToLogin(req, 'not-configured', next);

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(PARTNER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/partner',
    maxAge: PARTNER_COOKIE_MAX_AGE,
  });
  return res;
}

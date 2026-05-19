// ============================================================================
// Magic-link callback
// ============================================================================
// Supabase redirects the user here after they click the link in their email.
// Two flows are supported:
//   - token_hash flow (preferred): the token is embedded in the email link
//     itself, so it works even when the link opens in a different browser
//     than the one that requested it (e.g. requested in Chrome, opened from
//     Gmail's in-app browser).
//   - code flow (fallback): PKCE — only works if the same browser made the
//     original request. Kept around so any in-flight links still resolve.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = url.searchParams.get('next') || '/';

  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');

  const supabase = await serverClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent(error.message), url),
      );
    }
    return NextResponse.redirect(new URL(next, url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent(error.message), url),
      );
    }
    return NextResponse.redirect(new URL(next, url));
  }

  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('Missing sign-in token.'), url),
  );
}

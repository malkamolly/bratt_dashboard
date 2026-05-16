// ============================================================================
// Magic-link callback
// ============================================================================
// Supabase redirects the user here after they click the link in their email.
// We exchange the one-time code for a real session cookie, then send them
// to the page they originally tried to visit (or "/" by default).
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { serverClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Missing sign-in code.'), url));
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL('/login?error=' + encodeURIComponent(error.message), url),
    );
  }

  // Allowlist enforcement happens in middleware on the very next request.
  return NextResponse.redirect(new URL(next, url));
}

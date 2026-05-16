'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { serverClient } from '@/lib/supabase';

/**
 * Server Action: send a magic-link sign-in email.
 *
 * Security note: we intentionally do NOT pre-check whether the email is on
 * the allowlist before sending. Pre-checking would leak "is this person on
 * the Bratt Tree team?" to anyone who tries random emails. Instead, the
 * email is sent unconditionally; middleware enforces the allowlist *after*
 * authentication succeeds.
 */
export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = String(formData.get('next') ?? '/');

  if (!email || !email.includes('@')) {
    redirect(`/login?error=${encodeURIComponent('Please enter a valid email.')}`);
  }

  const supabase = await serverClient();

  // Build the redirect URL from the request origin so this works on localhost
  // (npm run dev) AND on the production Vercel URL with no env-var fiddling.
  const hdrs = await headers();
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const host  = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const origin = `${proto}://${host}`;
  const callback = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/login?sent=1');
}

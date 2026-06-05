'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { serverClient } from '@/lib/supabase';

/**
 * Server Action: send a sign-in email.
 *
 * The email contains BOTH a one-click magic link AND a 6-digit code (the code
 * shows up only if the Supabase "Magic Link" email template includes the
 * {{ .Token }} variable). The code path exists for iPhone/iPad users who open
 * the dashboard from a home-screen shortcut: that shortcut runs in its own
 * isolated browser "box", and the magic link always opens in Safari (a
 * different box), so the link can never finish the login inside the shortcut.
 * Typing the code keeps the whole login inside the box they're already in.
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
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`,
    );
  }
  // Carry email + next forward so the code-entry step knows who is logging in.
  redirect(
    `/login?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
  );
}

/**
 * Server Action: finish sign-in by verifying the 6-digit code from the email.
 *
 * Unlike the magic link, this completes the login in whatever browser context
 * submitted the form — so it works inside an iOS home-screen shortcut.
 */
export async function verifyCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');
  const next = String(formData.get('next') ?? '/');

  const back = (msg: string) =>
    `/login?sent=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(
      next,
    )}&error=${encodeURIComponent(msg)}`;

  if (!email || !email.includes('@')) {
    redirect(back('Please start over and enter your email.'));
  }
  if (code.length !== 6) {
    redirect(back('Enter the 6-digit code from your email.'));
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });

  if (error) {
    redirect(back(error.message));
  }
  redirect(next);
}

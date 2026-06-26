'use server';

import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';

/**
 * Server Action: sign in with email + password.
 *
 * This is the "easy login" path for team members who struggle with the
 * emailed-code / magic-link flow. It is reached only from /easy-login, which
 * is intentionally NOT linked anywhere in the app — you hand the bookmark to
 * the specific people who should use it.
 *
 * Passwords are set/reset by an admin directly in the Supabase dashboard
 * (Authentication → Users), so the app never needs the powerful service-role
 * key. A successful sign-in here lands in exactly the same place as a magic
 * link: middleware still enforces the allowlist + role checks afterward, so
 * this changes HOW someone proves who they are, not WHAT they can access.
 */
export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  const back = (msg: string) =>
    `/easy-login?email=${encodeURIComponent(email)}&next=${encodeURIComponent(
      next,
    )}&error=${encodeURIComponent(msg)}`;

  if (!email || !email.includes('@')) {
    redirect(back('Please enter your email.'));
  }
  if (!password) {
    redirect(back('Please enter your password.'));
  }

  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Keep the message generic so we don't reveal whether the email exists.
    redirect(back("That email or password didn't match. Please try again."));
  }
  redirect(next);
}

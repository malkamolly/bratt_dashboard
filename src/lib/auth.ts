// ============================================================================
// Auth helpers
// ============================================================================
// One place for "who is the user, are they allowed, are they admin" checks.
// Used by middleware, server components, and route handlers.
// ============================================================================

import { serverClient } from './supabase';

export type AllowedUser = {
  email: string;
  role: 'user' | 'admin';
};

/**
 * Returns the current user's email + role if they are signed in AND on the
 * allowlist. Returns null otherwise.
 */
export async function getAllowedUser(): Promise<AllowedUser | null> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: row, error } = await supabase
    .from('allowed_emails')
    .select('email, role')
    .ilike('email', user.email)
    .maybeSingle();

  if (error || !row) return null;
  return { email: row.email, role: row.role as 'user' | 'admin' };
}

export async function requireAdmin(): Promise<AllowedUser> {
  const u = await getAllowedUser();
  if (!u || u.role !== 'admin') {
    throw new Error('Forbidden: admin access required.');
  }
  return u;
}

// ============================================================================
// Auth helpers
// ============================================================================
// One place for "who is the user, are they allowed, what hubs can they see"
// checks. Used by middleware, server components, and route handlers.
// ============================================================================

import { redirect } from 'next/navigation';
import { serverClient } from './supabase';

export type Role =
  | 'admin'
  | 'user'
  | 'sales_manager'
  | 'sales_arborist'
  | 'field_crew';

export type AllowedUser = {
  email: string;
  role: Role;
};

export type Hub = 'pace' | 'hub' | 'crew';

// Which roles can access which hubs. Admin sees everything; office staff
// (user) and the sales manager can see Pace + Hub; sales_arborist +
// field_crew are siloed to their own hub.
export const HUB_ACCESS: Record<Hub, ReadonlyArray<Role>> = {
  pace: ['admin', 'user', 'sales_manager'],
  hub: ['admin', 'user', 'sales_manager', 'sales_arborist'],
  crew: ['admin', 'user', 'field_crew'],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  user: 'Office',
  sales_manager: 'Sales Manager',
  sales_arborist: 'Sales Arborist',
  field_crew: 'Field Crew',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full edit access to every hub and all admin settings.',
  user: 'Office staff — view + daily entry on Pace, view on the other hubs.',
  sales_manager:
    'Like Office, plus can create and edit weekly meetings on the Sales Arborist Hub.',
  sales_arborist: 'View-only access to the Sales Arborist Hub.',
  field_crew: 'View-only access to the Field Crew Hub.',
};

/** Can this role create or edit meetings on the Sales Arborist Hub? */
export function canEditMeetings(role: Role): boolean {
  return role === 'admin' || role === 'sales_manager';
}

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
  return { email: row.email, role: row.role as Role };
}

export async function requireAdmin(): Promise<AllowedUser> {
  const u = await getAllowedUser();
  if (!u || u.role !== 'admin') {
    throw new Error('Forbidden: admin access required.');
  }
  return u;
}

export function canAccessHub(role: Role, hub: Hub): boolean {
  return HUB_ACCESS[hub].includes(role);
}

export function allowedHubsFor(role: Role): Hub[] {
  return (Object.keys(HUB_ACCESS) as Hub[]).filter((h) =>
    HUB_ACCESS[h].includes(role),
  );
}

/**
 * Guards a hub page. Redirects unauthenticated users to /login, signed-in
 * users without access to /access-denied. Returns the user on success.
 */
export async function requireHubAccess(hub: Hub): Promise<AllowedUser> {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!canAccessHub(u.role, hub)) redirect('/access-denied');
  return u;
}

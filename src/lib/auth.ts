// ============================================================================
// Auth helpers
// ============================================================================
// One place for "who is the user, are they allowed, what hubs can they see"
// checks. Used by middleware, server components, and route handlers.
// ============================================================================

import { redirect } from 'next/navigation';
import { serverClient } from './supabase';
import { isTagsUser } from './tags-config';

export type Role =
  | 'admin'
  | 'user'
  | 'sales_manager'
  | 'sales_arborist'
  | 'field_manager'
  | 'field_crew';

export type AllowedUser = {
  email: string;
  role: Role;
};

export type Hub = 'pace' | 'hub' | 'crew';

// The single owner of the private "My Projects" hub. This hub is gated by
// EMAIL, not by role, because it's a personal space for one person — even
// other admins shouldn't see it. Keep this in sync with the RLS policy in
// migration 047_personal_tasks.sql, which hardcodes the same address.
export const OWNER_EMAIL = 'molly@bratttree.com';

/** Is this the owner of the private My Projects hub? Case-insensitive. */
export function isOwner(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}

// Which roles can access which hubs. Admin sees everything; office staff
// (user) and the sales manager can see Pace + Hub; sales_arborist +
// field_crew are siloed to their own hub. field_manager mirrors
// sales_manager for the Field Crew Hub — view + edit on Crew only.
export const HUB_ACCESS: Record<Hub, ReadonlyArray<Role>> = {
  pace: ['admin', 'user', 'sales_manager'],
  hub: ['admin', 'user', 'sales_manager', 'sales_arborist'],
  crew: ['admin', 'user', 'field_manager', 'field_crew'],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  user: 'Office',
  sales_manager: 'Sales Manager',
  sales_arborist: 'Sales Arborist',
  field_manager: 'Field Manager',
  field_crew: 'Field Crew',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full edit access to every hub and all admin settings.',
  user: 'Office staff — view + daily entry on Pace, view on the other hubs.',
  sales_manager:
    'Like Office, plus can create and edit weekly meetings on the Sales Arborist Hub.',
  sales_arborist: 'View-only access to the Sales Arborist Hub.',
  field_manager:
    'View the Field Crew Hub, plus edit crew skill levels, trainings, development plans, and daily huddles.',
  field_crew: 'View-only access to the Field Crew Hub.',
};

/** Can this role create or edit meetings on the Sales Arborist Hub? */
export function canEditMeetings(role: Role): boolean {
  return role === 'admin' || role === 'sales_manager';
}

/**
 * Can this role use the PHC price calculator? Open to admin, the sales manager,
 * and sales arborists.
 */
export function canUseCalculator(role: Role): boolean {
  return role === 'admin' || role === 'sales_manager' || role === 'sales_arborist';
}

/**
 * Can this role use the Site Markup tool (permit / power line clearance
 * plans)? Open to admin, the sales manager, and sales arborists.
 */
export function canUseSiteMarkup(role: Role): boolean {
  return role === 'admin' || role === 'sales_manager' || role === 'sales_arborist';
}

/** Can this role create or edit Field Crew Hub data (skills, trainings, plans, huddles)? */
export function canEditCrew(role: Role): boolean {
  return role === 'admin' || role === 'field_manager';
}

/**
 * Can this role use the PHC Scheduling Hub (upload renewals, work the call
 * list)? This is dispatch/office work, so admin + office (user) + the sales
 * manager. Note: adjusting treatment TIMING stays admin-only — that's the
 * separate /admin/phc-timing screen.
 */
export function canUsePhcScheduling(role: Role): boolean {
  return role === 'admin' || role === 'user' || role === 'sales_manager';
}

/**
 * Can this role use the office SOP / documentation library (/sops)? This is
 * an office/dispatch tool, so admin + office (user) + the sales manager —
 * the same set that can use the Pace hub and PHC scheduling. Mirrors
 * sop_can_access() in migration 056_sop_library.sql.
 */
export function canUseSops(role: Role): boolean {
  return role === 'admin' || role === 'user' || role === 'sales_manager';
}

/**
 * Can this role use the Off-Season Work pace tracker (/off-season)? Office/
 * dispatch tool, so admin + office (user) + the sales manager — the same set
 * that uses the Pace hub and PHC scheduling. Mirrors off_season_can_access()
 * in migration 062_off_season_pace.sql.
 */
export function canUseOffSeason(role: Role): boolean {
  return role === 'admin' || role === 'user' || role === 'sales_manager';
}

/**
 * Can this role see the Tree Removal Cost Analysis? Leadership review tool —
 * limited to admins and the sales manager because it surfaces pricing and
 * per-salesperson comparisons.
 */
// Cost Analysis is restricted to specific PEOPLE, not a whole role — like the
// private My Projects hub (see OWNER_EMAIL above). These three are the only ones
// who see the pricing data, the Add & Review screen, and Job Costing. Keep this
// list in sync with the `removals` table RLS policies in migration 066.
export const COST_ANALYSIS_EMAILS: readonly string[] = [
  'molly@bratttree.com',
  'connor@bratttree.com',
  'caleb@bratttree.com',
];

/** Can this person see Cost Analysis? Gated by email, case-insensitive. */
export function canSeeCostAnalysis(email: string | null | undefined): boolean {
  return !!email && COST_ANALYSIS_EMAILS.includes(email.toLowerCase());
}

// Video Notes lives in the Admin area but is restricted to specific PEOPLE, not
// the whole admin role — the leadership trio. Anyone can see the Admin card if
// they're an admin, but only these three see (and can use) the Video Notes tool
// and its API routes. Keep in sync with the RLS in migrations 060 and 061.
export const VIDEO_NOTES_EMAILS: readonly string[] = [
  'molly@bratttree.com',
  'connor@bratttree.com',
  'caleb@bratttree.com',
];

/** Can this person use the Video Notes tool? Gated by email, case-insensitive. */
export function canUseVideoNotes(email: string | null | undefined): boolean {
  return !!email && VIDEO_NOTES_EMAILS.includes(email.toLowerCase());
}

// The head arborist. His coaching corrections are the FINAL authority in the
// analysis playbook — they override imported Library knowledge, Claude's
// general knowledge, and any other team member's corrections. This is a
// deliberate, load-bearing rule (see docs/video-notes.md and CLAUDE.md); do not
// weaken it. Update the address here if Connor ever logs in under a new one.
export const HEAD_ARBORIST_EMAIL = 'connor@bratttree.com';

/** Is this the head arborist (final authority over the playbook)? */
export function isHeadArborist(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === HEAD_ARBORIST_EMAIL;
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

/**
 * Guards the private My Projects hub. Only the single owner email may enter;
 * everyone else (including other admins) is bounced to /access-denied.
 */
export async function requireOwner(): Promise<AllowedUser> {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isOwner(u.email)) redirect('/access-denied');
  return u;
}

/**
 * Guards the Slack Tags board. Unlike My Projects (owner-only), this is open to
 * anyone on the per-person Slack Tags allowlist (see tags-config.ts). Each user
 * still sees only their own data (enforced by RLS). Redirects others away.
 */
export async function requireTagsUser(): Promise<AllowedUser> {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isTagsUser(u.email)) redirect('/access-denied');
  return u;
}

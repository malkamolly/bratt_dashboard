// ============================================================================
// Sales Arborist Hub roster (database-backed)
// ============================================================================
// The Team Roster used to be a set of markdown files in src/content/arborists/.
// It now lives in the `salespeople` table so that adding a salesperson in
// Admin automatically puts them on the roster (see migration 042).
//
// `name` in the table is the FIRST name only (e.g. "Alex"), because that's the
// key sales attribution matches on. The roster shows a display name built from
// `name` + `last_initial` (e.g. "Alex P"). Two non-human attribution buckets
// ("Other", "Add-Ons") also live in this table; they have on_roster = false and
// never appear on the roster.
// ============================================================================

import { serverClient } from '@/lib/supabase';

export type RosterMember = {
  id: string;
  slug: string; // URL slug, e.g. "alex-p" (derived from name + last initial)
  name: string; // display name, e.g. "Alex P"
  title: string;
  certified: boolean;
  isa_number: string | null;
  manager: boolean;
  photo: string | null;
  phone: string | null;
  salesperson_name: string; // raw first name, used to match sales data
};

type Row = {
  id: string;
  name: string;
  last_initial: string | null;
  title: string | null;
  certified: boolean | null;
  isa_number: string | null;
  is_manager: boolean | null;
  photo_url: string | null;
  phone: string | null;
  on_roster: boolean | null;
  is_active: boolean | null;
  display_order: number | null;
};

const COLS =
  'id, name, last_initial, title, certified, isa_number, is_manager, photo_url, phone, on_roster, is_active, display_order';

/** Build the URL slug the same way the old markdown filenames were named. */
export function rosterSlug(name: string, lastInitial: string | null): string {
  const base = lastInitial ? `${name} ${lastInitial}` : name;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function toMember(r: Row): RosterMember {
  const displayName = r.last_initial ? `${r.name} ${r.last_initial}` : r.name;
  return {
    id: r.id,
    slug: rosterSlug(r.name, r.last_initial),
    name: displayName,
    title: r.title ?? 'Sales Arborist',
    certified: !!r.certified,
    isa_number: r.isa_number ?? null,
    manager: !!r.is_manager,
    photo: r.photo_url ?? null,
    phone: r.phone ?? null,
    salesperson_name: r.name,
  };
}

/**
 * Everyone who belongs on the public Team Roster: active, flagged on_roster.
 * Managers are pinned to the end (mirrors the old roster); the rest are
 * alphabetical by display name.
 */
export async function listRoster(): Promise<RosterMember[]> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('salespeople')
    .select(COLS)
    .eq('on_roster', true)
    .eq('is_active', true);
  const members = ((data ?? []) as Row[]).map(toMember);
  return members.sort((a, b) => {
    if (a.manager !== b.manager) return a.manager ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** Look up a roster member by URL slug (for the profile page). */
export async function getRosterMemberBySlug(
  slug: string,
): Promise<RosterMember | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('salespeople')
    .select(COLS)
    .eq('on_roster', true);
  return ((data ?? []) as Row[]).map(toMember).find((m) => m.slug === slug) ?? null;
}

/**
 * Look up a roster member by their raw salesperson name (the first name stored
 * in the table). Used by the sales pages to pull cert badge + photo for a
 * salesperson row. Matches any salesperson, on the roster or not.
 */
export async function getRosterMemberBySalespersonName(
  name: string,
): Promise<RosterMember | null> {
  const supabase = await serverClient();
  const { data } = await supabase
    .from('salespeople')
    .select(COLS)
    .ilike('name', name)
    .maybeSingle();
  return data ? toMember(data as Row) : null;
}

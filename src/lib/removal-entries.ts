// ============================================================================
// Leadership-entered removal jobs (the Cost Analysis "holding pen")
// ============================================================================
// Reads the removal_entries table (migration 066) and maps rows into the same
// RemovalRow shape the rest of the analysis speaks. Two audiences:
//   - loadIncludedEntries(): just the 'included' jobs, merged into the analysis
//     by cost-analysis.ts's loadRemovals().
//   - loadAllEntries(): every entry (any status) for the review screen.
//
// Every read is wrapped so a missing table or a transient DB error degrades to
// "no extra jobs" instead of crashing the page. That means the dashboard keeps
// rendering off the static historical export even before this migration has run
// on the database — a safe rollout.
// ============================================================================

import { serverClient } from './supabase';
import type { RemovalRow } from './cost-analysis';

export type EntryStatus = 'pending' | 'included' | 'excluded';

/** A holding-pen row: a RemovalRow plus its review metadata. */
export type RemovalEntry = RemovalRow & {
  id: string;
  status: EntryStatus;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
};

const COLS =
  'id,inv,haul,price,dbh,stems,height,crown,species,seller,date,muni,kind,status,note,added_by,created_at';

/** Postgres numeric can arrive as number or string; normalize to number|null. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toEntry(e: Record<string, unknown>): RemovalEntry {
  return {
    id: String(e.id),
    inv: e.inv == null ? null : String(e.inv),
    haul: e.haul !== false,
    price: num(e.price),
    dbh: num(e.dbh),
    stems: (num(e.stems) ?? 1) as number,
    height: num(e.height),
    crown: num(e.crown),
    species: e.species == null ? null : String(e.species),
    seller: e.seller == null ? null : String(e.seller),
    date: e.date == null ? null : String(e.date),
    muni: e.muni === true,
    kind: (e.kind as RemovalRow['kind']) ?? 'tree',
    status: (e.status as EntryStatus) ?? 'pending',
    note: e.note == null ? null : String(e.note),
    addedBy: e.added_by == null ? null : String(e.added_by),
    createdAt: String(e.created_at ?? ''),
  };
}

/** The included jobs only, as plain RemovalRows, to merge into the analysis. */
export async function loadIncludedEntries(): Promise<RemovalRow[]> {
  try {
    const sb = await serverClient();
    const { data, error } = await sb
      .from('removal_entries')
      .select(COLS)
      .eq('status', 'included');
    if (error || !data) return [];
    return data.map(toEntry);
  } catch {
    return [];
  }
}

/** Every entry (any status), newest first, for the review screen. */
export async function loadAllEntries(): Promise<RemovalEntry[]> {
  try {
    const sb = await serverClient();
    const { data, error } = await sb
      .from('removal_entries')
      .select(COLS)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(toEntry);
  } catch {
    return [];
  }
}

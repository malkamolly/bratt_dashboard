// ============================================================================
// Removals store — the DB-backed job dataset for Cost Analysis
// ============================================================================
// Reads the `removals` table (migration 066), the single source of truth for
// every removal — historical + leadership-added + uploaded. Maps rows into the
// RemovalRow shape the analysis speaks.
//
//   status  = the human switch: 'included' (in the dataset), 'pending' (awaiting
//             review), 'removed' (hidden, recoverable).
//   price   = each row keeps original_price (real billed amount, never changed)
//             and an optional adjusted_price (leadership override). The analysis
//             uses the adjusted price when present, else the original.
//
// Every read is wrapped so a missing table or DB error degrades safely:
//   - loadIncludedRemovals() returns null on error, so loadRemovals() falls back
//     to the static export and the site keeps working BEFORE this migration runs.
//   - the review-screen reads return [] on error.
// ============================================================================

import { serverClient } from './supabase';
import type { RemovalRow } from './cost-analysis';

export type EntryStatus = 'included' | 'pending' | 'removed';
export type EntrySource = 'historical' | 'manual' | 'upload';

/** A full removals row: the analysis fields plus review/price/audit metadata. */
export type RemovalEntry = RemovalRow & {
  id: string;
  status: EntryStatus;
  source: EntrySource;
  /** Real billed amount, never overwritten. */
  originalPrice: number | null;
  /** Leadership's override, or null if the job hasn't been adjusted. */
  adjustedPrice: number | null;
  note: string | null;
  addedBy: string | null;
  createdAt: string;
};

const COLS =
  'id,inv,haul,original_price,adjusted_price,dbh,stems,height,crown,species,seller,date,muni,kind,status,source,note,added_by,created_at';

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** The price the analysis should use: the adjustment if set, else the original. */
function effectivePrice(e: Record<string, unknown>): number | null {
  return num(e.adjusted_price) ?? num(e.original_price);
}

/** A DB row as a plain RemovalRow (what the analysis consumes). */
function toRow(e: Record<string, unknown>): RemovalRow {
  return {
    inv: e.inv == null ? null : String(e.inv),
    haul: e.haul !== false,
    price: effectivePrice(e),
    dbh: num(e.dbh),
    stems: (num(e.stems) ?? 1) as number,
    height: num(e.height),
    crown: num(e.crown),
    species: e.species == null ? null : String(e.species),
    seller: e.seller == null ? null : String(e.seller),
    date: e.date == null ? null : String(e.date),
    muni: e.muni === true,
    kind: (e.kind as RemovalRow['kind']) ?? 'tree',
  };
}

/** A DB row as a full entry (adds review/price/audit fields for the UI). */
function toEntry(e: Record<string, unknown>): RemovalEntry {
  return {
    ...toRow(e),
    id: String(e.id),
    status: (e.status as EntryStatus) ?? 'pending',
    source: (e.source as EntrySource) ?? 'manual',
    originalPrice: num(e.original_price),
    adjustedPrice: num(e.adjusted_price),
    note: e.note == null ? null : String(e.note),
    addedBy: e.added_by == null ? null : String(e.added_by),
    createdAt: String(e.created_at ?? ''),
  };
}

/**
 * Every 'included' removal, as plain RemovalRows — the set the analysis reads.
 * Returns null (not []) on any DB error, so the caller can fall back to the
 * static export before this migration has run.
 */
export async function loadIncludedRemovals(): Promise<RemovalRow[] | null> {
  try {
    const sb = await serverClient();
    const { data, error } = await sb.from('removals').select(COLS).eq('status', 'included');
    if (error) return null;
    return (data ?? []).map(toRow);
  } catch {
    return null;
  }
}

/** Pending entries (the review queue), newest first. */
export async function loadReviewEntries(): Promise<RemovalEntry[]> {
  try {
    const sb = await serverClient();
    const { data, error } = await sb
      .from('removals')
      .select(COLS)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(toEntry);
  } catch {
    return [];
  }
}

/** Does any row already use this invoice number? (Duplicate guardrail for adds.) */
export async function invoiceExists(inv: string): Promise<boolean> {
  try {
    const sb = await serverClient();
    const { data, error } = await sb.from('removals').select('id').eq('inv', inv).limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

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
  /** Who last edited this job, and when (ISO). */
  updatedAt: string | null;
  reviewedBy: string | null;
  /** Snapshot of the original field values (migration 067), or null if absent. */
  original: Record<string, unknown> | null;
};

// Core columns present since migration 066 — safe to select anywhere.
const CORE_COLS =
  'id,inv,haul,original_price,adjusted_price,dbh,stems,height,crown,species,seller,date,muni,kind,status,source,note,added_by,created_at,updated_at,reviewed_by';
// Adds the original-values snapshot (migration 067). Only the management/edit
// reads need it; they fall back to CORE_COLS if 067 hasn't run yet.
const FULL_COLS = `${CORE_COLS},original`;

// Supabase returns at most 1000 rows per request. The dataset is larger than
// that, so any read that must see EVERY row pages through in 1000-row chunks.
const PAGE = 1000;

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
    updatedAt: e.updated_at == null ? null : String(e.updated_at),
    reviewedBy: e.reviewed_by == null ? null : String(e.reviewed_by),
    original:
      e.original && typeof e.original === 'object' ? (e.original as Record<string, unknown>) : null,
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
    const out: RemovalRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('removals')
        .select(CORE_COLS)
        .eq('status', 'included')
        .range(from, from + PAGE - 1);
      // First-page error means the table isn't readable (e.g. not migrated yet)
      // -> null so the caller falls back to the static export.
      if (error) return from === 0 ? null : out;
      if (!data || data.length === 0) break;
      out.push(...data.map(toRow));
      if (data.length < PAGE) break;
    }
    return out;
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
      .select(CORE_COLS)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data.map(toEntry);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Duplicate detection for spreadsheet uploads
// ---------------------------------------------------------------------------
// A single invoice can legitimately hold several trees (328 invoices in the
// historical set do), so "this invoice already exists" is the WRONG test for an
// upload — it would throw away every tree but the first. Instead each row gets a
// fingerprint of its measured values, and we import only as many copies of a
// given fingerprint as the file has beyond what the table already holds. That
// makes re-uploading an overlapping date range safe: real repeats survive,
// re-imports don't pile up.

/** Fingerprint of a row's identity: invoice + price + measurements + date. */
export function rowSignature(r: {
  inv: string | null;
  price: number | null;
  dbh: number | null;
  height: number | null;
  crown: number | null;
  date: string | null;
}): string {
  // Round to cents/tenths so a float round-trip through Postgres still matches.
  const n = (v: number | null, dp: number) => (v == null ? '' : v.toFixed(dp));
  return [r.inv ?? '', n(r.price, 2), n(r.dbh, 1), n(r.height, 1), n(r.crown, 1), r.date ?? ''].join(
    '|',
  );
}

/**
 * How many rows the table already holds for each fingerprint, limited to the
 * given invoice numbers. Uses original_price (the real billed amount) because a
 * leadership price adjustment must not make a row look like a different job.
 */
export async function countExistingSignatures(invs: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const unique = [...new Set(invs.filter(Boolean))];
  if (unique.length === 0) return counts;
  try {
    const sb = await serverClient();
    // Chunked so a long invoice list can't blow past the URL length limit.
    const CHUNK = 150;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const { data, error } = await sb
        .from('removals')
        .select('inv,original_price,dbh,height,crown,date')
        .in('inv', unique.slice(i, i + CHUNK));
      if (error || !data) continue;
      for (const r of data as Record<string, unknown>[]) {
        const sig = rowSignature({
          inv: r.inv == null ? null : String(r.inv),
          price: num(r.original_price),
          dbh: num(r.dbh),
          height: num(r.height),
          crown: num(r.crown),
          date: r.date == null ? null : String(r.date),
        });
        counts.set(sig, (counts.get(sig) ?? 0) + 1);
      }
    }
    return counts;
  } catch {
    return counts;
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

// ---------------------------------------------------------------------------
// Job management (the sortable / searchable list + edit page)
// ---------------------------------------------------------------------------

export type JobSort = 'date' | 'price' | 'dbh' | 'height' | 'crown' | 'species' | 'seller' | 'inv';

/**
 * Every job of a given status (included or removed), for the management list.
 * The dataset is small (~2k rows), so we load it all and let the page filter,
 * sort, and paginate in memory — that's what lets us filter by the computed
 * "in pricing" state, which isn't a stored column. Pages through the 1000-row
 * cap, and falls back to CORE_COLS if the original-snapshot column (067) is
 * missing.
 */
export async function loadEntriesByStatus(status: EntryStatus): Promise<RemovalEntry[]> {
  const out: RemovalEntry[] = [];
  try {
    const sb = await serverClient();
    let cols = FULL_COLS;
    for (let from = 0; ; from += PAGE) {
      let { data, error } = await sb
        .from('removals')
        .select(cols)
        .eq('status', status)
        .order('date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      // If the snapshot column isn't there yet, drop to CORE_COLS and retry.
      if (error && cols === FULL_COLS) {
        cols = CORE_COLS;
        ({ data, error } = await sb
          .from('removals')
          .select(cols)
          .eq('status', status)
          .order('date', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1));
      }
      if (error || !data || data.length === 0) break;
      out.push(...(data as unknown as Record<string, unknown>[]).map(toEntry));
      if (data.length < PAGE) break;
    }
    return out;
  } catch {
    return out;
  }
}

/** One job by id, for the edit page. */
export async function loadJobById(id: string): Promise<RemovalEntry | null> {
  try {
    const sb = await serverClient();
    let { data, error } = await sb.from('removals').select(FULL_COLS).eq('id', id).maybeSingle();
    if (error) ({ data, error } = await sb.from('removals').select(CORE_COLS).eq('id', id).maybeSingle());
    if (error || !data) return null;
    return toEntry(data);
  } catch {
    return null;
  }
}

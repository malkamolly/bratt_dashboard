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

// ---------------------------------------------------------------------------
// Job management (the sortable / searchable list + edit page)
// ---------------------------------------------------------------------------

export type JobSort = 'date' | 'price' | 'dbh' | 'height' | 'crown' | 'species' | 'seller' | 'inv';

// UI sort key -> column. Price sorts by original_price (adjustments are rare, so
// this matches the shown price for all but a handful of jobs).
const SORT_COL: Record<JobSort, string> = {
  date: 'date',
  price: 'original_price',
  dbh: 'dbh',
  height: 'height',
  crown: 'crown',
  species: 'species',
  seller: 'seller',
  inv: 'inv',
};

/** One page of jobs for the management list, plus the total matching count. */
export async function loadJobsPage(opts: {
  q?: string;
  sort?: JobSort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  showRemoved?: boolean;
}): Promise<{ jobs: RemovalEntry[]; total: number }> {
  try {
    const sb = await serverClient();
    const pageSize = opts.pageSize ?? 50;
    const page = Math.max(1, opts.page ?? 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sortCol = SORT_COL[opts.sort ?? 'date'];
    const ascending = (opts.dir ?? 'desc') === 'asc';

    let query = sb.from('removals').select(COLS, { count: 'exact' });
    query = opts.showRemoved
      ? query.in('status', ['included', 'removed'])
      : query.eq('status', 'included');

    // Keep the search term to safe characters before interpolating into ilike.
    const q = (opts.q ?? '').replace(/[^A-Za-z0-9 .\-]/g, '').trim();
    if (q) query = query.or(`inv.ilike.%${q}%,species.ilike.%${q}%,seller.ilike.%${q}%`);

    query = query
      .order(sortCol, { ascending, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, to);

    const { data, error, count } = await query;
    if (error || !data) return { jobs: [], total: 0 };
    return { jobs: data.map(toEntry), total: count ?? 0 };
  } catch {
    return { jobs: [], total: 0 };
  }
}

/**
 * Invoice -> count of INCLUDED rows, so the list can tell whether a job is the
 * only tree on its invoice (part of the "counts toward pricing" test).
 */
export async function loadIncludedInvoiceCounts(): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  try {
    const sb = await serverClient();
    const { data, error } = await sb.from('removals').select('inv').eq('status', 'included');
    if (error || !data) return m;
    for (const r of data as { inv: unknown }[]) {
      const inv = r.inv == null ? null : String(r.inv);
      if (inv) m.set(inv, (m.get(inv) ?? 0) + 1);
    }
    return m;
  } catch {
    return m;
  }
}

/** One job by id, for the edit page. */
export async function loadJobById(id: string): Promise<RemovalEntry | null> {
  try {
    const sb = await serverClient();
    const { data, error } = await sb.from('removals').select(COLS).eq('id', id).maybeSingle();
    if (error || !data) return null;
    return toEntry(data);
  } catch {
    return null;
  }
}

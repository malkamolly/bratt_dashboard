// ============================================================================
// Spreadsheet import — turning the Hub's "Invoice Items" export into removals
// ============================================================================
// The Hub (ServiceTitan) exports one row per invoice line item. The measurements
// we need for Cost Analysis are NOT columns — they live inside the free-text
// Item Description, typed by hand by whoever sold the job:
//
//     Tree Removal Premium Service
//     # of Tree(s): 1
//     Tree Species: basswood
//     Location of Tree(s): backyard center
//     DBH: 41.5"
//     Height: 55.2ft
//     Crown spread: 53.8ft
//     Bratt Tree team arrives and sets up their proprietary system to...
//
// So this module's whole job is reading that text. It is deliberately forgiving
// about formatting (curly quotes, "ft" vs "'", missing line breaks) and
// deliberately STRICT about what it claims to know: anything it can't read
// confidently becomes a null plus a plain-English note, so the row still lands
// in Pending for a human to look at rather than being silently guessed at.
//
// The one rule that matters most: when the text describes more than one trunk
// (a clump, a spar, several trees billed on one line), we record stems > 1.
// The pricing math in cost-analysis.ts only counts single-trunk, fully-measured
// trees, so an honest stems count keeps a messy row out of the pricing set while
// its money still shows up in the headline totals. Guessing a single DBH for a
// 5-stem clump would quietly poison the pricing curve — never do that.
//
// The report is grouped by date, so the sheet also holds date-header rows
// ("Scheduled Date: 8/3/2026"), per-day subtotal rows, and a grand total. Those
// have no invoice number or item code, which is how we skip them.
// ============================================================================

import * as XLSX from 'xlsx';

/** One parsed line item, shaped for the `removals` table. */
export type ParsedJob = {
  inv: string;
  price: number | null;
  dbh: number | null;
  stems: number;
  height: number | null;
  crown: number | null;
  species: string | null;
  seller: string | null;
  /** ISO date (YYYY-MM-DD) from the Scheduled/Completion Date column. */
  date: string | null;
  haul: boolean;
  muni: boolean;
  kind: 'tree';
  /** Plain-English record of anything the parser interpreted, for the reviewer. */
  note: string | null;
  /** Would this row reach the pricing set, or totals only? Drives the summary. */
  fullyMeasured: boolean;
};

export type SkippedRow = {
  reason: 'not-a-removal' | 'not-completed' | 'no-price';
  detail: string;
};

export type ImportParse = {
  jobs: ParsedJob[];
  skipped: SkippedRow[];
  /** False when the file has no recognizable header row (wrong report). */
  headerFound: boolean;
  /** The date range actually present in the file, for the confirmation message. */
  firstDate: string | null;
  lastDate: string | null;
};

// ---------------------------------------------------------------------------
// Text cleanup
// ---------------------------------------------------------------------------

/**
 * The Hub emits non-breaking spaces and smart quotes freely — often mid-number
 * (`DBH: 65”`). Flatten them so one set of patterns can read every row.
 */
function clean(s: string): string {
  return s
    .replace(/ /g, ' ')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, '-');
}

// Every description ends with the same canned service blurb. It has to go before
// we read anything, because a missing line break glues it onto the last value —
// "DBH: 11Tree is Cut Down - No Hauling of Material..." is a real row.
const BOILERPLATE =
  /(Bratt Tree team arrives|Our team does NOT use Chippers|Tree is Cut Down|Client understands that material)/i;

function stripBoilerplate(s: string): string {
  const m = BOILERPLATE.exec(s);
  return m ? s.slice(0, m.index) : s;
}

/**
 * The rest of the line following a label. `[^\S\r\n]` is "space or tab but not a
 * newline" — that matters: an empty `DBH:` line must NOT be allowed to reach down
 * and borrow the number off the `Height:` line below it, which would invent a
 * trunk diameter out of thin air.
 */
function lineAfter(label: string, s: string): string | null {
  const re = new RegExp(`${label}[^\\S\\r\\n]*:[^\\S\\r\\n]*([^\\r\\n]*)`, 'i');
  const m = re.exec(s);
  return m ? m[1].trim() : null;
}

function numbersIn(s: string): number[] {
  return (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

/** First number on a label's line, ignoring units ("55.2ft", "64.5'", "30"). */
function firstNumber(s: string | null): number | null {
  if (!s) return null;
  const ns = numbersIn(s);
  return ns.length > 0 ? ns[0] : null;
}

// ---------------------------------------------------------------------------
// Reading the trunk (DBH + stem count) — the delicate part
// ---------------------------------------------------------------------------

// Wording that means "not one clean trunk" even when only one number is given.
const MULTI_WORDS = /stem|clump|spar|multi|trunks/i;
// "5 stems from 4" to 10"" / "4 clumps of..." — this leading number COUNTS the
// trunks, it is not a diameter. Reading it as a DBH would be badly wrong.
const STEM_COUNT = /(\d+)\s*(?:stems|clumps|trunks)\b/i;

type Trunk = { dbh: number | null; stems: number; why: string[] };

function readTrunk(dbhText: string, treeCount: number | null): Trunk {
  const why: string[] = [];
  const text = dbhText.trim();
  let vals = numbersIn(text);
  let stems: number | null = null;

  // "5 stems from 4" to 10"" -> 5 trunks, and 4/10 are the range of diameters.
  const sc = STEM_COUNT.exec(text);
  if (sc) {
    stems = Number(sc[1]);
    vals = numbersIn(text.slice(0, sc.index) + text.slice(sc.index + sc[0].length));
    why.push(`${stems} stems`);
  }

  // Several trees billed on one line item. We can't split them — there's a single
  // price for the lot — so keep one row and mark it multi-trunk. It stays out of
  // the pricing set and still counts in the totals.
  if (treeCount != null && treeCount > 1) {
    stems = Math.max(stems ?? 1, treeCount);
    why.push(`${treeCount} trees on one line item`);
  }

  // One tree, several diameters listed -> a clump.
  if (stems == null && vals.length > 1) {
    stems = vals.length;
    why.push(`${vals.length} trunks listed`);
  }

  // Clump wording but a single number -> still not a single stem.
  if (stems == null && MULTI_WORDS.test(text)) {
    stems = 2;
    why.push('multi-stem wording');
  }

  if (stems == null) stems = 1;

  // For a clump the largest trunk is the only figure worth showing; stems > 1
  // already keeps it out of the pricing math, so this is display only.
  let dbh: number | null = null;
  if (vals.length > 0) dbh = stems === 1 ? vals[0] : Math.max(...vals);

  if (dbh != null && (dbh <= 0 || dbh > 120)) {
    why.push(`ignored an out-of-range DBH of ${dbh}"`);
    dbh = null;
  }

  return { dbh, stems, why };
}

// ---------------------------------------------------------------------------
// Other fields
// ---------------------------------------------------------------------------

function readSpecies(body: string): string | null {
  const raw = lineAfter('Tree Species', body);
  if (!raw) return null;
  const s = raw
    // A missing line break can run the next label onto this one.
    .replace(/\b(Location of Tree|DBH|Height|Crown spread)\b.*$/i, '')
    // "Ash (Tree # 4 of 5" — the sellers number trees on big multi-tree jobs.
    .replace(/\(\s*Tree\s*#.*$/i, '')
    .replace(/[\s,;:-]+$/, '')
    .trim();
  return s || null;
}

/**
 * House rule: people are stored as First name + Last initial ("Patrick W").
 * The Hub exports full names, so every seller gets converted on the way in.
 */
export function normalizeSellerName(raw: string): string | null {
  const s = clean(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const parts = s.split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}`;
}

/** A cell as YYYY-MM-DD. Handles real dates and "7/31/2026" text from CSVs. */
function readDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (us) {
    const yr = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
    return `${yr}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  return null;
}

/** A price cell as a number: handles 1248.4, "$1,248.40", and blanks. */
function readPrice(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// The workbook
// ---------------------------------------------------------------------------

// Columns we look for, by header text (lowercased). Matching on NAME rather than
// position means a re-ordered or slightly different export still imports.
const COLS = {
  code: 'item code',
  name: 'item name',
  inv: 'invoice number',
  desc: 'item description',
  price: 'item price',
  date: 'scheduled date',
  seller: 'sold by technician',
  status: 'job status',
} as const;

type ColMap = Partial<Record<keyof typeof COLS, number>>;

/** Locate the header row and map our fields onto column indexes. */
function findHeader(rows: unknown[][]): { row: number; map: ColMap } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const labels = rows[i].map((c) => String(c ?? '').trim().toLowerCase());
    if (!labels.includes(COLS.inv) || !labels.includes(COLS.desc)) continue;
    const map: ColMap = {};
    for (const [key, label] of Object.entries(COLS) as [keyof typeof COLS, string][]) {
      const at = labels.indexOf(label);
      if (at >= 0) map[key] = at;
    }
    return { row: i, map };
  }
  return null;
}

/**
 * Parse a Hub "Invoice Items" export into pending removal rows.
 * Pure and synchronous — no DB, no auth — so it can be reasoned about and tested
 * on a real file without touching the database.
 */
export function parseRemovalWorkbook(data: ArrayBuffer | Uint8Array): ImportParse {
  const wb = XLSX.read(data, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
  });

  const header = findHeader(rows);
  if (!header) {
    return { jobs: [], skipped: [], headerFound: false, firstDate: null, lastDate: null };
  }
  const { map } = header;
  const at = (row: unknown[], key: keyof typeof COLS): unknown =>
    map[key] == null ? null : row[map[key] as number];

  const jobs: ParsedJob[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = header.row + 1; i < rows.length; i++) {
    const row = rows[i];
    const inv = String(at(row, 'inv') ?? '').trim();
    const code = String(at(row, 'code') ?? '').trim();

    // Date-group headers, per-day subtotals and the grand total have no invoice
    // number and no item code. That's how we tell them from real line items.
    if (!inv || !code) continue;

    const itemName = String(at(row, 'name') ?? '').trim();

    // Only tree removals. A wider export can contain pruning, stump grinding and
    // plant health care, none of which belong in the removal dataset.
    if (!/^R-TR/i.test(code)) {
      skipped.push({ reason: 'not-a-removal', detail: `${inv} — ${itemName || code}` });
      continue;
    }

    const status = String(at(row, 'status') ?? '').trim();
    if (status && status.toLowerCase() !== 'completed') {
      skipped.push({ reason: 'not-completed', detail: `${inv} — ${status}` });
      continue;
    }

    const price = readPrice(at(row, 'price'));
    if (price == null) {
      skipped.push({ reason: 'no-price', detail: `${inv} — no price` });
      continue;
    }

    const body = stripBoilerplate(clean(String(at(row, 'desc') ?? '')));

    const treeCount = firstNumber(lineAfter('#\\s*of\\s*Tree\\(s\\)', body));
    const dbhText = lineAfter('DBH', body) ?? '';
    const trunk = readTrunk(dbhText, treeCount == null ? null : Math.round(treeCount));

    let height = firstNumber(lineAfter('Height', body));
    let crown = firstNumber(lineAfter('Crown spread', body));
    const why = [...trunk.why];
    if (height != null && (height <= 0 || height > 200)) {
      why.push(`ignored an out-of-range height of ${height}'`);
      height = null;
    }
    if (crown != null && (crown <= 0 || crown > 200)) {
      why.push(`ignored an out-of-range crown spread of ${crown}'`);
      crown = null;
    }

    // "- NO HAULING" is its own item code (R-TRNH) as well as a name suffix.
    const haul = !/nh$/i.test(code) && !/no\s*hauling/i.test(itemName);

    const missing: string[] = [];
    if (trunk.dbh == null) missing.push('DBH');
    if (height == null) missing.push('height');
    if (crown == null) missing.push('crown spread');

    const noteParts = ['Uploaded from spreadsheet.'];
    if (why.length > 0) noteParts.push(`Read as: ${why.join('; ')}.`);
    if (missing.length > 0) noteParts.push(`Not in the description: ${missing.join(', ')}.`);
    // Show the raw text whenever we had to interpret it, so the reviewer can
    // check our reading against what the seller actually typed.
    if ((why.length > 0 || missing.includes('DBH')) && dbhText) {
      noteParts.push(`DBH text: "${dbhText.slice(0, 120)}"`);
    }

    jobs.push({
      inv,
      price,
      dbh: trunk.dbh,
      stems: trunk.stems,
      height,
      crown,
      species: readSpecies(body),
      seller: normalizeSellerName(String(at(row, 'seller') ?? '')),
      date: readDate(at(row, 'date')),
      haul,
      // Nothing in the export identifies a municipal job, so these all come in as
      // non-municipal; leadership flags them during review.
      muni: false,
      kind: 'tree',
      note: noteParts.length > 1 ? noteParts.join(' ') : noteParts[0],
      fullyMeasured: trunk.stems === 1 && trunk.dbh != null && height != null && crown != null,
    });
  }

  const dates = jobs.map((j) => j.date).filter((d): d is string => !!d).sort();

  return {
    jobs,
    skipped,
    headerFound: true,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

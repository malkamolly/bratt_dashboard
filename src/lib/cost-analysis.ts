// ============================================================================
// Tree Removal cost analysis (server-only, static data)
// ============================================================================
// Reads a one-time export of the last year's removal line items
// (src/data/removals.json, parsed from the ServiceTitan "Invoice Item Detail"
// report) and turns it into the aggregates the /cost-analysis dashboard shows.
//
// All money math lives here as pure functions so the page component stays a
// thin "load -> render" shell. Nothing here touches the database; when we're
// ready to make this self-refreshing we only change where `loadRemovals()`
// reads from, not the page.
//
// Vocabulary note for future readers:
//   DBH = "Diameter at Breast Height" — trunk thickness ~4.5ft up. The
//   standard arborist size measure and the backbone of this whole analysis.
// ============================================================================

import rawRows from '@/data/removals.json';

export type RemovalRow = {
  /** Invoice number — lets leadership look the job up in ServiceTitan. */
  inv: string | null;
  /** true = removal WITH hauling (R-TR); false = "NO HAULING" (R-TRNH). */
  haul: boolean;
  price: number | null;
  /** Largest trunk diameter in inches (DBH), or null if not recorded. */
  dbh: number | null;
  /** How many trunk measurements were listed. >1 means a multi-stem/clump. */
  stems: number;
  height: number | null;
  crown: number | null;
  species: string | null;
  /** Salesperson, stored First + Last-initial per the house naming rule. */
  seller: string | null;
  /** ISO date (YYYY-MM-DD) of the invoice. */
  date: string | null;
  /**
   * Municipal (government) job, taken from the office's own "Tree Work -
   * Municipal" Job Business Unit tag — the authoritative classification, not
   * a guess from the customer name. Excluded from this analysis per
   * leadership: municipal work is bid differently (contract / volume) than
   * residential, so it would skew the pricing picture.
   */
  muni: boolean;
  /**
   * What the line item's DESCRIPTION actually is. The pricebook code is
   * unreliable — salespeople sometimes pick "Tree Removal" for stump / vine /
   * shrub work — so this is read from the description template. Only 'tree'
   * rows are real tree removals; the rest are excluded from the analysis.
   */
  kind: 'tree' | 'stump' | 'vine' | 'shrub';
};

/**
 * Rows we trust for size-based price comparison: a single trunk, a recorded
 * size, and a real removal price. We drop prices under $100 because those are
 * almost always partial line items or adjustments, not a tree's removal cost.
 */
const MIN_REAL_PRICE = 100;

/**
 * A single job, slimmed down for the click-to-expand invoice lists. Every
 * grouping below the hero chart carries the jobs behind it so leadership can
 * drill in and read off the invoice numbers.
 */
export type JobRef = {
  inv: string | null;
  dbh: number;
  height: number | null;
  price: number;
  seller: string | null;
  species: string | null;
  haul: boolean;
  date: string | null;
};

function toJob(r: RemovalRow): JobRef {
  return {
    inv: r.inv,
    dbh: r.dbh!,
    height: r.height,
    price: r.price!,
    seller: r.seller,
    species: r.species,
    haul: r.haul,
    date: r.date,
  };
}

/** Map rows to JobRefs, priciest first (the order leadership reads them in). */
function toJobs(rows: RemovalRow[]): JobRef[] {
  return rows.map(toJob).sort((a, b) => b.price - a.price);
}

/** The mid-size band we hold constant when isolating a single price driver. */
const REF_LO = 13;
const REF_HI = 24;

export function loadRemovals(): RemovalRow[] {
  return rawRows as RemovalRow[];
}

// ---------------------------------------------------------------------------
// Small stats helpers
// ---------------------------------------------------------------------------

function median(xs: number[]): number | null {
  return quantile(xs, 0.5);
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Linear-interpolated quantile. Returns null for an empty list. */
function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// Per leadership: to really analyze pricing we zoom in on the cleanest records
// only — single-trunk trees that are FULLY MEASURED (DBH + Height + Crown all
// recorded). (The "one tree per job" requirement is applied in buildCostAnalysis,
// since it needs the per-invoice line-item count.)
function isComparable(
  r: RemovalRow,
): r is RemovalRow & { dbh: number; price: number; height: number; crown: number } {
  return (
    r.dbh != null &&
    r.stems === 1 &&
    r.price != null &&
    r.price >= MIN_REAL_PRICE &&
    r.height != null &&
    r.crown != null &&
    r.crown > 0 &&
    r.crown <= 100
  );
}

// ---------------------------------------------------------------------------
// Size bands
// ---------------------------------------------------------------------------

export type SizeBand = {
  label: string;
  lo: number; // inclusive, inches
  hi: number; // inclusive, inches (Infinity for the open top band)
  /**
   * Per-band price floor (set by leadership). A real removal of a tree this
   * size costs at least this much, so anything billed below it is a partial
   * line item (one tree split across rows) or a miscoded size, and is dropped
   * from the size-pricing set.
   */
  floor: number;
};

// Bands stay 6" wide up to 18", then switch to 5" intervals above 18" (per
// leadership), running all the way to 70"+ to see the shape at the top end —
// even though the biggest bands hold very few trees.
export const SIZE_BANDS: SizeBand[] = [
  { label: '1–6"', lo: 0, hi: 6, floor: MIN_REAL_PRICE },
  { label: '7–12"', lo: 7, hi: 12, floor: 280 },
  { label: '13–18"', lo: 13, hi: 18, floor: 400 },
  { label: '19–23"', lo: 19, hi: 23, floor: 900 },
  { label: '24–28"', lo: 24, hi: 28, floor: 1200 },
  { label: '29–33"', lo: 29, hi: 33, floor: 1500 },
  { label: '34–38"', lo: 34, hi: 38, floor: 2000 },
  { label: '39–43"', lo: 39, hi: 43, floor: 2800 },
  { label: '44–48"', lo: 44, hi: 48, floor: 3500 },
  { label: '49–53"', lo: 49, hi: 53, floor: 3500 },
  { label: '54–58"', lo: 54, hi: 58, floor: 3500 },
  { label: '59–63"', lo: 59, hi: 63, floor: 3500 },
  { label: '64–68"', lo: 64, hi: 68, floor: 3500 },
  { label: '69"+', lo: 69, hi: Infinity, floor: 3500 },
];

// ---------------------------------------------------------------------------
// Suggested per-inch pricing model
// ---------------------------------------------------------------------------
// Derived from the clean set's median cost-per-inch: a base $/inch of DBH, plus
// flat per-inch surcharges when a tree exceeds the "tall" and "wide" thresholds
// already used in the charts. Additive & simple on purpose; it's slightly
// conservative for trees that are BOTH tall and wide (those run ~$122/in vs the
// model's ~$105/in).
export const PRICING_MODEL = {
  basePerInch: 75,
  tallSurcharge: 10, // +$/inch when height exceeds tallThreshold
  wideSurcharge: 20, // +$/inch when crown exceeds wideThreshold
  tallThreshold: 50, // feet
  wideThreshold: 30, // feet (crown spread)
};

export type ModelResult = {
  ratePerInch: number;
  price: number;
  tall: boolean;
  wide: boolean;
};

/** Apply the suggested model. height/crown null → that surcharge doesn't apply. */
export function modelPrice(
  dbh: number,
  height: number | null,
  crown: number | null,
): ModelResult {
  const tall = height != null && height > PRICING_MODEL.tallThreshold;
  const wide = crown != null && crown > PRICING_MODEL.wideThreshold;
  const ratePerInch =
    PRICING_MODEL.basePerInch +
    (tall ? PRICING_MODEL.tallSurcharge : 0) +
    (wide ? PRICING_MODEL.wideSurcharge : 0);
  return { ratePerInch, price: Math.round(dbh * ratePerInch), tall, wide };
}

/**
 * The band a tree belongs to, assigned by lower bound so there are no gaps:
 * each band runs from its `lo` up to the next band's `lo`. (The integer `hi`
 * is only for labels — matching on lo/hi would drop fractional sizes like
 * 6.5" or 42.5" that fall between two bands' edges.)
 */
function bandFor(dbh: number): SizeBand {
  let chosen = SIZE_BANDS[0];
  for (const b of SIZE_BANDS) {
    if (dbh >= b.lo) chosen = b;
    else break;
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// The aggregates the page renders
// ---------------------------------------------------------------------------

export type Summary = {
  /** Records in the clean analysis subset (single-tree, fully-measured). */
  analyzed: number;
  /** All non-municipal tree-removal line items, before the narrowing. */
  totalTreeRemovals: number;
  /** Invoices whose whole tree-removal work was a single tree. */
  singleTreeJobs: number;
  totalRevenue: number;
  /** Per-tree price (= per-job here, since every record is one tree/job). */
  medianPrice: number | null;
  meanPrice: number | null;
  /** Municipal jobs filtered out before any of the above was computed. */
  excludedMunicipal: number;
  /** Miscoded stump / vine / shrub line items filtered out up front. */
  excludedNonTree: number;
  dateFrom: string | null;
  dateTo: string | null;
};

export type BandStat = {
  label: string;
  count: number;
  min: number;
  p25: number;
  median: number;
  mean: number;
  p75: number;
  max: number;
  items: JobRef[];
};

export type ScatterPoint = { dbh: number; price: number; haul: boolean };

export type DriverCompare = {
  label: string;
  count: number;
  median: number;
  items: JobRef[];
};

export type GridCell = { median: number; count: number; items: JobRef[] } | null;
/**
 * A size-band × second-factor grid of median prices. Used for both the height
 * grid and the crown-spread grid — same shape, different columns.
 */
export type MeasureGrid = {
  cols: string[];
  rows: { band: string; cells: GridCell[] }[];
};

export type CpiCell = { perInch: number; count: number } | null;
/**
 * Cost per inch of trunk (price ÷ DBH), laid out by height (rows) × crown
 * spread (cols). Shows that two same-DBH trees cost very differently depending
 * on how tall and wide they are — the case for pricing on more than trunk size.
 */
export type CostPerInchGrid = {
  heightRows: string[];
  crownCols: string[];
  cells: CpiCell[][];
  overallPerInch: number;
  min: number;
  max: number;
};

export type Outlier = {
  inv: string | null;
  dbh: number;
  price: number;
  band: string;
  bandMedian: number;
  ratio: number; // price / band median
  seller: string | null;
  species: string | null;
  haul: boolean;
  date: string | null;
};

export type CostAnalysis = {
  summary: Summary;
  bands: BandStat[];
  scatter: ScatterPoint[];
  hauling: DriverCompare[];
  heightGrid: MeasureGrid;
  crownGrid: MeasureGrid;
  costPerInch: CostPerInchGrid;
  species: DriverCompare[];
  sellers: DriverCompare[];
  refBandLabel: string;
  highOutliers: Outlier[];
  lowOutliers: Outlier[];
};

/** Median price + count + member jobs for a slice of comparable rows. */
function compare(rows: RemovalRow[], label: string): DriverCompare | null {
  const valid = rows.filter((r) => r.price != null);
  const m = median(valid.map((r) => r.price!));
  if (m == null) return null;
  return { label, count: valid.length, median: Math.round(m), items: toJobs(valid) };
}

export function buildCostAnalysis(): CostAnalysis {
  const all = loadRemovals();
  // Two exclusions up front, before any number is computed:
  //  1. Non-tree services (stump / vine / shrub) miscoded under the tree
  //     removal pricebook code — they're different work at different prices.
  //  2. Municipal (government) jobs — leadership's call; bid on contract terms.
  // Everything downstream (counts, revenue, bands, drivers, outliers) sees only
  // the remaining residential/commercial TREE removals.
  const trees = all.filter((r) => r.kind === 'tree');
  const excludedNonTree = all.length - trees.length;
  const removals = trees.filter((r) => !r.muni);
  const excludedMunicipal = trees.length - removals.length;

  // "One tree per job": keep only invoices whose entire tree-removal work was a
  // single line item. (Counts tree line items per invoice across all non-muni
  // removals, before the measurement narrowing.)
  const treesPerInvoice = new Map<string, number>();
  for (const r of removals) {
    if (!r.inv) continue;
    treesPerInvoice.set(r.inv, (treesPerInvoice.get(r.inv) ?? 0) + 1);
  }
  const singleTreeJobs = [...treesPerInvoice.values()].filter((n) => n === 1).length;

  // The analysis universe: single-tree jobs, single trunk, fully measured
  // (DBH + Height + Crown), priced at or above the band floor.
  const comparable = removals
    .filter(isComparable)
    .filter((r) => r.price >= bandFor(r.dbh).floor)
    .filter((r) => r.inv != null && treesPerInvoice.get(r.inv) === 1);
  const dates = comparable.map((r) => r.date).filter((d): d is string => !!d).sort();

  const prices = comparable.map((r) => r.price);

  const summary: Summary = {
    analyzed: comparable.length,
    totalTreeRemovals: removals.length,
    singleTreeJobs,
    totalRevenue: Math.round(comparable.reduce((s, r) => s + r.price, 0)),
    medianPrice: round(median(prices)),
    meanPrice: round(mean(prices)),
    excludedMunicipal,
    excludedNonTree,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  };

  // Size band table — the seed of the future pricing guide.
  const bands: BandStat[] = SIZE_BANDS.map((b) => {
    const rows = comparable.filter((r) => bandFor(r.dbh!) === b);
    const prices = rows.map((r) => r.price!);
    if (prices.length === 0) return null;
    return {
      label: b.label,
      count: prices.length,
      min: round(quantile(prices, 0))!,
      p25: round(quantile(prices, 0.25))!,
      median: round(median(prices))!,
      mean: round(mean(prices))!,
      p75: round(quantile(prices, 0.75))!,
      max: round(quantile(prices, 1))!,
      items: toJobs(rows),
    } satisfies BandStat;
  }).filter((b): b is BandStat => b !== null);

  // Scatter — every comparable job as a point. ~1,300 points renders fine.
  const scatter: ScatterPoint[] = comparable.map((r) => ({
    dbh: r.dbh!,
    price: r.price!,
    haul: r.haul,
  }));

  // --- Single-driver comparisons, all held inside the reference size band ---
  const ref = comparable.filter((r) => r.dbh! >= REF_LO && r.dbh! <= REF_HI);
  const refBandLabel = `${REF_LO}–${REF_HI}" trunk`;

  const hauling = [
    compare(ref.filter((r) => r.haul), 'With hauling'),
    compare(ref.filter((r) => !r.haul), 'No hauling'),
  ].filter((d): d is DriverCompare => d !== null);

  // Species (n >= 8 within the reference band), highest median first.
  const species = groupCompare(
    ref.filter((r) => r.species),
    (r) => r.species!,
    8,
  );

  // Seller consistency (n >= 12 within the reference band) — the case for a guide.
  const sellers = groupCompare(
    ref.filter((r) => r.seller),
    (r) => r.seller!,
    12,
  );

  // --- Size band (rows) x second-factor class (cols) grids of median price ---
  // Height: standard short/medium/tall.
  const heightGrid = buildMeasureGrid(
    comparable,
    ['Short (≤30′)', 'Medium (31–50′)', 'Tall (>50′)'],
    (r) => (r.height == null ? -1 : r.height <= 30 ? 0 : r.height <= 50 ? 1 : 2),
  );
  // Crown spread (canopy width): narrow/medium/wide. Crown is only recorded on
  // ~2/3 of jobs and has the occasional junk value, so we ignore anything that
  // isn't a plausible 1–100′ measurement.
  const crownGrid = buildMeasureGrid(
    comparable,
    ['Narrow (≤15′)', 'Medium (16–30′)', 'Wide (>30′)'],
    (r) =>
      r.crown == null || r.crown <= 0 || r.crown > 100
        ? -1
        : r.crown <= 15
        ? 0
        : r.crown <= 30
        ? 1
        : 2,
  );

  // --- Cost per inch (price / DBH) by height × crown ---
  const cpiHeightRows = ['Short (≤30′)', 'Medium (31–50′)', 'Tall (>50′)'];
  const cpiCrownCols = ['Narrow (≤15′)', 'Medium (16–30′)', 'Wide (>30′)'];
  const hCls = (h: number) => (h <= 30 ? 0 : h <= 50 ? 1 : 2);
  const cCls = (c: number) => (c <= 15 ? 0 : c <= 30 ? 1 : 2);
  const cpiCells: CpiCell[][] = cpiHeightRows.map((_, hi) =>
    cpiCrownCols.map((_, ci) => {
      const vals = comparable
        .filter((r) => hCls(r.height) === hi && cCls(r.crown) === ci)
        .map((r) => r.price / r.dbh);
      if (vals.length < 5) return null;
      return { perInch: round(median(vals))!, count: vals.length };
    }),
  );
  const cpiPresent = cpiCells.flat().filter((c): c is { perInch: number; count: number } => c !== null);
  const costPerInch: CostPerInchGrid = {
    heightRows: cpiHeightRows,
    crownCols: cpiCrownCols,
    cells: cpiCells,
    overallPerInch: round(median(comparable.map((r) => r.price / r.dbh)))!,
    min: Math.min(...cpiPresent.map((c) => c.perInch)),
    max: Math.max(...cpiPresent.map((c) => c.perInch)),
  };

  // --- Outliers: jobs far from their own band's median ---
  const bandMedians = new Map(bands.map((b) => [b.label, b.median]));
  const withRatio: Outlier[] = comparable
    .map((r) => {
      const band = bandFor(r.dbh!);
      const bm = bandMedians.get(band.label);
      if (!bm) return null;
      return {
        inv: r.inv,
        dbh: r.dbh!,
        price: r.price!,
        band: band.label,
        bandMedian: bm,
        ratio: r.price! / bm,
        seller: r.seller,
        species: r.species,
        haul: r.haul,
        date: r.date,
      } satisfies Outlier;
    })
    .filter((o): o is Outlier => o !== null);

  const highOutliers = [...withRatio]
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 12);
  const lowOutliers = [...withRatio]
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 12);

  return {
    summary,
    bands,
    scatter,
    hauling,
    heightGrid,
    crownGrid,
    costPerInch,
    species,
    sellers,
    refBandLabel,
    highOutliers,
    lowOutliers,
  };
}

/**
 * Build a size-band × class grid of median prices. `classify` maps a row to a
 * column index (or -1 to skip it, e.g. the measurement is missing). Cells with
 * fewer than 5 jobs are left blank, and all-blank rows are dropped.
 */
function buildMeasureGrid(
  comparable: RemovalRow[],
  cols: string[],
  classify: (r: RemovalRow) => number,
): MeasureGrid {
  return {
    cols,
    rows: SIZE_BANDS.map((b) => {
      const inBand = comparable.filter((r) => bandFor(r.dbh!) === b);
      const cells: GridCell[] = cols.map((_, ci) => {
        const rs = inBand.filter((r) => classify(r) === ci);
        if (rs.length < 5) return null; // too thin to trust
        return {
          median: round(median(rs.map((r) => r.price!)))!,
          count: rs.length,
          items: toJobs(rs),
        };
      });
      return { band: b.label, cells };
    }).filter((row) => row.cells.some((c) => c !== null)),
  };
}

/** Group rows by a key, keep groups with >= minN, return medians sorted desc. */
function groupCompare(
  rows: RemovalRow[],
  key: (r: RemovalRow) => string,
  minN: number,
): DriverCompare[] {
  const groups = new Map<string, RemovalRow[]>();
  for (const r of rows) {
    if (r.price == null) continue;
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: DriverCompare[] = [];
  for (const [label, rs] of groups) {
    if (rs.length < minN) continue;
    out.push({
      label,
      count: rs.length,
      median: round(median(rs.map((r) => r.price!)))!,
      items: toJobs(rs),
    });
  }
  return out.sort((a, b) => b.median - a.median);
}

function round(n: number | null): number | null {
  return n == null ? null : Math.round(n);
}

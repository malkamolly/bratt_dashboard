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

function isComparable(r: RemovalRow): r is RemovalRow & { dbh: number; price: number } {
  return (
    r.dbh != null &&
    r.stems === 1 &&
    r.price != null &&
    r.price >= MIN_REAL_PRICE
  );
}

// ---------------------------------------------------------------------------
// Size bands
// ---------------------------------------------------------------------------

export type SizeBand = {
  label: string;
  lo: number; // inclusive, inches
  hi: number; // inclusive, inches (Infinity for the open top band)
};

export const SIZE_BANDS: SizeBand[] = [
  { label: '1–6"', lo: 0, hi: 6 },
  { label: '7–12"', lo: 7, hi: 12 },
  { label: '13–18"', lo: 13, hi: 18 },
  { label: '19–24"', lo: 19, hi: 24 },
  { label: '25–30"', lo: 25, hi: 30 },
  { label: '31–36"', lo: 31, hi: 36 },
  { label: '37"+', lo: 37, hi: Infinity },
];

function bandFor(dbh: number): SizeBand {
  return SIZE_BANDS.find((b) => dbh >= b.lo && dbh <= b.hi) ?? SIZE_BANDS[SIZE_BANDS.length - 1];
}

// ---------------------------------------------------------------------------
// The aggregates the page renders
// ---------------------------------------------------------------------------

export type Summary = {
  totalRemovals: number;
  withSize: number;
  multiStem: number;
  comparable: number;
  totalRevenue: number;
  /** Per-tree (per line item) price across all removals. */
  medianPrice: number | null;
  meanPrice: number | null;
  /** Per-job (per invoice) totals — every tree on an invoice summed together. */
  jobCount: number;
  jobMedian: number | null;
  jobMean: number | null;
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

export type HeightCell = { median: number; count: number; items: JobRef[] } | null;
export type HeightGrid = {
  heightCols: string[];
  rows: { band: string; cells: HeightCell[] }[];
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
  heightGrid: HeightGrid;
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

  const comparable = removals.filter(isComparable);
  const dates = removals.map((r) => r.date).filter((d): d is string => !!d).sort();

  // Roll line items up to whole jobs (invoices): sum every tree on an invoice.
  const byInvoice = new Map<string, number>();
  for (const r of removals) {
    if (r.price == null || r.inv == null) continue;
    byInvoice.set(r.inv, (byInvoice.get(r.inv) ?? 0) + r.price);
  }
  const jobTotals = [...byInvoice.values()];
  const allPrices = removals.map((r) => r.price).filter((p): p is number => p != null);

  const summary: Summary = {
    totalRemovals: removals.length,
    withSize: removals.filter((r) => r.dbh != null).length,
    multiStem: removals.filter((r) => r.stems > 1).length,
    comparable: comparable.length,
    totalRevenue: Math.round(
      removals.reduce((s, r) => s + (r.price ?? 0), 0),
    ),
    medianPrice: round(median(allPrices)),
    meanPrice: round(mean(allPrices)),
    jobCount: jobTotals.length,
    jobMedian: round(median(jobTotals)),
    jobMean: round(mean(jobTotals)),
    excludedMunicipal,
    excludedNonTree,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  };

  // Size band table — the seed of the future pricing guide.
  const bands: BandStat[] = SIZE_BANDS.map((b) => {
    const rows = comparable.filter((r) => r.dbh! >= b.lo && r.dbh! <= b.hi);
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

  // --- Height grid: size band (rows) x height class (cols), median price ---
  const heightCols = ['Short (≤30′)', 'Medium (31–50′)', 'Tall (>50′)'];
  const heightClass = (h: number) => (h <= 30 ? 0 : h <= 50 ? 1 : 2);
  const heightGrid: HeightGrid = {
    heightCols,
    rows: SIZE_BANDS.map((b) => {
      const inBand = comparable.filter(
        (r) => r.dbh! >= b.lo && r.dbh! <= b.hi && r.height != null,
      );
      const cells: HeightCell[] = heightCols.map((_, ci) => {
        const rows = inBand.filter((r) => heightClass(r.height!) === ci);
        if (rows.length < 5) return null; // too thin to trust
        return {
          median: round(median(rows.map((r) => r.price!)))!,
          count: rows.length,
          items: toJobs(rows),
        };
      });
      return { band: b.label, cells };
    }).filter((row) => row.cells.some((c) => c !== null)),
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
    species,
    sellers,
    refBandLabel,
    highOutliers,
    lowOutliers,
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

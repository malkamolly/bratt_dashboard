// ============================================================================
// Stump Herbicide price book — Sales Arborist quote calculator
//
// Pricing is a flat price PER STUMP, chosen by the stump's diameter (inches).
// This is deliberately written as plain data so a non-engineer can update the
// numbers when pricing changes — just edit the STUMP_BANDS table below.
//
// Bands are matched by diameter from smallest to largest: a stump falls into
// the first band whose `maxDia` it does not exceed. Anything larger than the
// last band is priced at STUMP_OVERFLOW_PRICE. `minDia` is only used for the
// human-readable label; matching is driven by `maxDia`, so there are no gaps
// (e.g. a 10.5" stump rolls up into the next band).
// ============================================================================

export type StumpBand = {
  /** Low end of the range, for display only (e.g. "11–15\""). */
  minDia: number;
  /** High end of the range (inclusive) — this is what matching uses. */
  maxDia: number;
  /** Price per stump in this range. */
  price: number;
};

export const STUMP_BANDS: StumpBand[] = [
  { minDia: 1, maxDia: 10, price: 50 },
  { minDia: 11, maxDia: 15, price: 75 },
  { minDia: 16, maxDia: 20, price: 95 },
  { minDia: 21, maxDia: 25, price: 120 },
  { minDia: 26, maxDia: 30, price: 145 },
  { minDia: 31, maxDia: 35, price: 170 },
  { minDia: 36, maxDia: 40, price: 195 },
  { minDia: 41, maxDia: 45, price: 245 },
  { minDia: 46, maxDia: 50, price: 300 },
];

/** Price per stump for anything larger than the last band (over 50"). */
export const STUMP_OVERFLOW_PRICE = 365;

export type StumpPriceResult =
  | { ok: true; price: number }
  | { ok: false; reason: string };

/** Price a single stump by its diameter (inches). */
export function priceForStump(diameter: number): StumpPriceResult {
  if (!Number.isFinite(diameter) || diameter <= 0) {
    return { ok: false, reason: 'Enter a stump diameter greater than 0.' };
  }
  for (const band of STUMP_BANDS) {
    if (diameter <= band.maxDia) return { ok: true, price: band.price };
  }
  return { ok: true, price: STUMP_OVERFLOW_PRICE };
}

/** Label for the band a diameter falls into, e.g. "21–25\"" or "over 50\"". */
export function stumpBandLabel(diameter: number): string | null {
  if (!Number.isFinite(diameter) || diameter <= 0) return null;
  for (const band of STUMP_BANDS) {
    if (diameter <= band.maxDia) return `${band.minDia}–${band.maxDia}"`;
  }
  const last = STUMP_BANDS[STUMP_BANDS.length - 1];
  return `${last.maxDia + 1}"+`;
}

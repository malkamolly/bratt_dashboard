// ============================================================================
// Draft pricing matrix (fixed sandbox)
// ============================================================================
// A per-DBH-category rate card: each of 12 size categories has its own base
// $/inch plus graduated height and canopy adjustments ($/inch, +/- from the
// "typical" reference tier). Seeded from the clean data — the 12 base rates are
// real medians; the per-category ladders are scaled off each base using the
// overall tier pattern (the data is too thin to fit each size's ladder on its
// own). Everything here is a FIXED constant to react to and tune, not a live
// recompute and not a committed price sheet. Numbers live in
// src/data/pricing-matrix.json.
// ============================================================================

import matrix from '@/data/pricing-matrix.json';

export type Tier = { label: string; lo: number; hi: number | null };
export type PricingCategory = {
  label: string;
  lo: number;
  hi: number | null;
  base: number;
  height: number[]; // per height tier, $/inch adjustment (+/-)
  canopy: number[]; // per canopy tier, $/inch adjustment (+/-)
};
export type PricingMatrix = {
  heightTiers: Tier[];
  canopyTiers: Tier[];
  heightRefIndex: number;
  canopyRefIndex: number;
  categories: PricingCategory[];
};

export const PRICING_MATRIX = matrix as PricingMatrix;

function inTier(v: number, t: Tier): boolean {
  return v >= t.lo && (t.hi == null || v <= t.hi);
}

export function categoryIndexFor(dbh: number): number {
  const i = PRICING_MATRIX.categories.findIndex((c) => inTier(dbh, c));
  return i >= 0 ? i : PRICING_MATRIX.categories.length - 1;
}
function tierIndexFor(v: number, tiers: Tier[]): number {
  const i = tiers.findIndex((t) => inTier(v, t));
  return i >= 0 ? i : tiers.length - 1;
}

export type MatrixResult = {
  category: PricingCategory;
  base: number;
  heightTierLabel: string | null;
  heightMod: number;
  canopyTierLabel: string | null;
  canopyMod: number;
  ratePerInch: number;
  price: number;
};

/**
 * Price a tree off the matrix. Height/crown null → that adjustment is skipped
 * (treated as $0), and its tier label comes back null.
 */
export function modelPriceMatrix(
  dbh: number,
  height: number | null,
  crown: number | null,
): MatrixResult {
  const ci = categoryIndexFor(dbh);
  const category = PRICING_MATRIX.categories[ci];

  let heightMod = 0;
  let heightTierLabel: string | null = null;
  if (height != null && Number.isFinite(height)) {
    const t = tierIndexFor(height, PRICING_MATRIX.heightTiers);
    heightMod = category.height[t] ?? 0;
    heightTierLabel = PRICING_MATRIX.heightTiers[t].label;
  }

  let canopyMod = 0;
  let canopyTierLabel: string | null = null;
  if (crown != null && Number.isFinite(crown)) {
    const t = tierIndexFor(crown, PRICING_MATRIX.canopyTiers);
    canopyMod = category.canopy[t] ?? 0;
    canopyTierLabel = PRICING_MATRIX.canopyTiers[t].label;
  }

  const ratePerInch = category.base + heightMod + canopyMod;
  return {
    category,
    base: category.base,
    heightTierLabel,
    heightMod,
    canopyTierLabel,
    canopyMod,
    ratePerInch,
    price: Math.round(dbh * ratePerInch),
  };
}

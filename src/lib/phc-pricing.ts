// ============================================================================
// PHC (Plant Health Care) price book — Sales Arborist quote calculator
//
// Source of truth: the "Master PHC Price Guide" tab of SalesPHC_Price_Book.xlsx.
// This file is a faithful, hand-encoded copy of that tab. When prices change,
// edit the numbers here (they are deliberately written as plain data so a
// non-engineer can update them).
//
// There are two pricing shapes in the price book:
//   1. "banded"  — a fixed price per DBH range (e.g. up to 9" = $126).
//   2. "perInch" — a flat base price up to a cutoff DBH, then a fixed dollar
//                  amount added for every inch above that cutoff.
//
// DBH = "diameter at breast height", the trunk diameter measured ~4.5 ft up.
// It is the standard size measure used for tree-care pricing.
//
// A few treatments in the spreadsheet share another treatment's price chart
// (their own price cells were left blank under a shared header). Where that
// happens, the shared bands are reused below and called out in a comment.
// ============================================================================

export type Overflow =
  // Tree is larger than the biggest band in the chart. What then?
  | { kind: 'perInch'; perInch: number } // topBandPrice + (dbh − topMax) × perInch
  | { kind: 'flat'; price: number } // a single flat price for anything above
  | { kind: 'consult' }; // off the chart — must consult the PHC manager

export type BandedPricing = {
  scheme: 'banded';
  /** Bands are inclusive ranges, sorted smallest → largest, non-overlapping. */
  bands: { minDbh: number; maxDbh: number; price: number }[];
  overflow: Overflow;
};

export type PerInchPricing = {
  scheme: 'perInch';
  /** Flat price for any tree up to and including baseDbhMax. */
  basePrice: number;
  baseDbhMax: number;
  /** Dollars added per inch of DBH above baseDbhMax. */
  perInch: number;
};

export type Pricing = BandedPricing | PerInchPricing;

export type Service = {
  id: string;
  name: string;
  category: ServiceCategory;
  targetSpecies?: string;
  chemical?: string;
  /** Spray / Trunk injection / Basal Drench / Soil Injection. */
  treatmentType?: string;
  /** How often it's applied (Annual, Every-Other-Year, …). Informational —
   *  the price shown is always for one treatment year. */
  frequency?: string;
  /** Number of sprays bundled into the price, when noted. */
  sprays?: string;
  /** When true, the chart price is void for trees over 25 ft tall. */
  heightLimit?: boolean;
  pricing: Pricing;
};

export type ServiceCategory =
  | 'Single Sprays — Insects & Mites'
  | 'Foliar Disease — Deciduous (Spray)'
  | 'Apple Scab — Trunk Injection'
  | 'Conifer Needle Disease (Spray)'
  | 'Soil & Health Treatments (by DBH)'
  | 'Pest & Disease Treatments (by DBH)';

/** Categories in the order they should appear in the picker. */
export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Single Sprays — Insects & Mites',
  'Foliar Disease — Deciduous (Spray)',
  'Apple Scab — Trunk Injection',
  'Conifer Needle Disease (Spray)',
  'Soil & Health Treatments (by DBH)',
  'Pest & Disease Treatments (by DBH)',
];

// ----------------------------------------------------------------------------
// Shared band tables (reused where the spreadsheet left price cells blank
// under a shared header row).
// ----------------------------------------------------------------------------

// "Spray Services: Single Spray" — every named insect/mite spray in this
// section uses the Insecticide Treatment chart. Over 54" DBH (or any tree
// over 25 ft tall) is off-chart → consult the PHC manager.
const SINGLE_SPRAY: BandedPricing = {
  scheme: 'banded',
  bands: [
    { minDbh: 0, maxDbh: 9, price: 126 },
    { minDbh: 10, maxDbh: 15, price: 138 },
    { minDbh: 16, maxDbh: 20, price: 162 },
    { minDbh: 21, maxDbh: 26, price: 237 },
    { minDbh: 27, maxDbh: 34, price: 323 },
    { minDbh: 35, maxDbh: 40, price: 377 },
    { minDbh: 41, maxDbh: 45, price: 434 },
    { minDbh: 46, maxDbh: 50, price: 477 },
    { minDbh: 51, maxDbh: 54, price: 524 },
  ],
  overflow: { kind: 'consult' },
};

// Marssonina Leaf Spot chart — shared by the other deciduous foliar sprays
// (Cedar Apple Rust, Apple Scab spray, Anthracnose) which had blank cells.
const DECIDUOUS_FOLIAR_SPRAY: BandedPricing = {
  scheme: 'banded',
  bands: [
    { minDbh: 0, maxDbh: 5, price: 250 },
    { minDbh: 6, maxDbh: 9, price: 270 },
    { minDbh: 10, maxDbh: 13, price: 310 },
    { minDbh: 14, maxDbh: 17, price: 330 },
  ],
  overflow: { kind: 'perInch', perInch: 20 }, // $20 per inch over 17"
};

// Dothistroma Needle Blight chart — shared by Diplodia Tip Blight and
// Rhizosphaera Needle Cast (blank cells under the same header).
const CONIFER_NEEDLE_SPRAY: BandedPricing = {
  scheme: 'banded',
  bands: [
    { minDbh: 0, maxDbh: 5, price: 375 },
    { minDbh: 6, maxDbh: 9, price: 405 },
    { minDbh: 10, maxDbh: 13, price: 465 },
    { minDbh: 14, maxDbh: 17, price: 495 },
  ],
  overflow: { kind: 'perInch', perInch: 30 }, // $30 per inch over 17"
};

/** The "$200 base up to 12", then $X per inch over 12"" model, by per-inch rate. */
function perInchOver12(perInch: number): PerInchPricing {
  return { scheme: 'perInch', basePrice: 200, baseDbhMax: 12, perInch };
}

// ----------------------------------------------------------------------------
// The catalog
// ----------------------------------------------------------------------------

export const SERVICES: Service[] = [
  // --- Single Sprays — Insects & Mites (all share the SINGLE_SPRAY chart) ---
  { id: 'insecticide-spray', name: 'Insecticide Treatment', category: 'Single Sprays — Insects & Mites', targetSpecies: 'All', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'european-pine-sawfly', name: 'European Pine Sawfly Treatment', category: 'Single Sprays — Insects & Mites', targetSpecies: 'Pine', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'aphid', name: 'Aphid Treatment', category: 'Single Sprays — Insects & Mites', targetSpecies: 'All deciduous', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'leaf-miner', name: 'Leaf Miner Treatment', category: 'Single Sprays — Insects & Mites', targetSpecies: 'Elm', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'white-pine-adelgid', name: 'White Pine Adelgid Treatment', category: 'Single Sprays — Insects & Mites', targetSpecies: 'White Pine', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'japanese-beetle', name: 'Japanese Beetle Treatment', category: 'Single Sprays — Insects & Mites', targetSpecies: 'All deciduous', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'white-marked-tussock-moth', name: 'White Marked Tussock Moth', category: 'Single Sprays — Insects & Mites', targetSpecies: 'All deciduous', chemical: 'Permethrin', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'spider-mite-spring', name: 'Spider Mite Treatment (Spring)', category: 'Single Sprays — Insects & Mites', targetSpecies: 'Spruce', chemical: 'Horticultural Oil', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'spider-mite-fall', name: 'Spider Mite Treatment (Fall)', category: 'Single Sprays — Insects & Mites', targetSpecies: 'Spruce', chemical: 'Miticide', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },
  { id: 'spider-mite-summer', name: 'Spider Mite Treatment (Summer)', category: 'Single Sprays — Insects & Mites', targetSpecies: 'Spruce', chemical: 'Horticultural Oil', treatmentType: 'Spray', heightLimit: true, pricing: SINGLE_SPRAY },

  // --- Foliar Disease — Deciduous (Spray) ---
  { id: 'marssonina-leaf-spot', name: 'Marssonina Leaf Spot Treatment', category: 'Foliar Disease — Deciduous (Spray)', targetSpecies: 'Poplar', chemical: 'Propiconazole', treatmentType: 'Spray', frequency: 'Every Year', sprays: '2 sprays included', pricing: DECIDUOUS_FOLIAR_SPRAY },
  { id: 'cedar-apple-rust', name: 'Cedar Apple Rust Treatment', category: 'Foliar Disease — Deciduous (Spray)', targetSpecies: 'Hawthorne', chemical: 'Propiconazole', treatmentType: 'Spray', frequency: 'Every Year', sprays: '2 sprays included', pricing: DECIDUOUS_FOLIAR_SPRAY },
  { id: 'apple-scab-spray', name: 'Apple Scab Treatment (Spray)', category: 'Foliar Disease — Deciduous (Spray)', targetSpecies: 'Crabapple', chemical: 'Propiconazole', treatmentType: 'Spray', frequency: 'Every Year', sprays: '2 sprays included', pricing: DECIDUOUS_FOLIAR_SPRAY },
  { id: 'anthracnose', name: 'Anthracnose Treatment', category: 'Foliar Disease — Deciduous (Spray)', targetSpecies: 'Oak', chemical: 'Propiconazole', treatmentType: 'Spray', frequency: 'Every Year', sprays: '2 sprays included', pricing: DECIDUOUS_FOLIAR_SPRAY },

  // --- Apple Scab — Trunk Injection (own charts; flat price above 17") ---
  {
    id: 'apple-scab-inject-budding',
    name: 'Apple Scab Treatment (Budding Season)',
    category: 'Apple Scab — Trunk Injection',
    targetSpecies: 'Crabapple',
    chemical: 'Propiconazole',
    treatmentType: 'Trunk injection',
    frequency: 'Every-Other-Year',
    pricing: {
      scheme: 'banded',
      bands: [
        { minDbh: 0, maxDbh: 5, price: 300 },
        { minDbh: 6, maxDbh: 9, price: 320 },
        { minDbh: 10, maxDbh: 13, price: 320 },
        { minDbh: 14, maxDbh: 17, price: 320 },
      ],
      overflow: { kind: 'flat', price: 350 },
    },
  },
  {
    id: 'apple-scab-inject-anytime',
    name: 'Apple Scab Treatment (Anytime of Year)',
    category: 'Apple Scab — Trunk Injection',
    targetSpecies: 'Crabapple',
    chemical: 'Propiconazole',
    treatmentType: 'Trunk injection',
    frequency: 'Every-Other-Year',
    pricing: {
      scheme: 'banded',
      bands: [
        { minDbh: 0, maxDbh: 5, price: 275 },
        { minDbh: 6, maxDbh: 9, price: 295 },
        { minDbh: 10, maxDbh: 13, price: 295 },
        { minDbh: 14, maxDbh: 17, price: 295 },
      ],
      overflow: { kind: 'flat', price: 325 },
    },
  },

  // --- Conifer Needle Disease (Spray) ---
  { id: 'dothistroma-needle-blight', name: 'Dothistroma Needle Blight Treatment', category: 'Conifer Needle Disease (Spray)', targetSpecies: 'Pine', chemical: 'Propiconazole', treatmentType: 'Spray', frequency: 'Every Year', sprays: '3 sprays included', pricing: CONIFER_NEEDLE_SPRAY },
  { id: 'diplodia-tip-blight', name: 'Diplodia Tip Blight Treatment', category: 'Conifer Needle Disease (Spray)', targetSpecies: 'Pine', chemical: 'Propiconazole', treatmentType: 'Spray', frequency: 'Every Year', sprays: '3 sprays included', pricing: CONIFER_NEEDLE_SPRAY },
  { id: 'rhizosphaera-needle-cast', name: 'Rhizosphaera Needle Cast Treatment', category: 'Conifer Needle Disease (Spray)', targetSpecies: 'Spruce', chemical: 'Chlorothalonil', treatmentType: 'Spray', frequency: 'Every Year', sprays: '3 sprays included', pricing: CONIFER_NEEDLE_SPRAY },

  // --- Soil & Health Treatments (by DBH) — $200 base, +$X/inch over 12" ---
  { id: 'root-developer', name: 'Root Developer Treatment', category: 'Soil & Health Treatments (by DBH)', chemical: 'NutriRoot', targetSpecies: 'All', treatmentType: 'Soil Injection', frequency: 'Can be monthly', pricing: perInchOver12(16) },
  { id: 'chlorosis-summer', name: 'Chlorosis Treatment (Summer)', category: 'Soil & Health Treatments (by DBH)', chemical: 'MnJet FE', targetSpecies: 'Birch, Oak, White Pine', treatmentType: 'Trunk injection', frequency: 'Annual', pricing: perInchOver12(12) },
  { id: 'chlorosis-fall', name: 'Chlorosis Treatment (Fall)', category: 'Soil & Health Treatments (by DBH)', chemical: 'MnJet FE', targetSpecies: 'All deciduous', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(12) },
  { id: 'drought-stress', name: 'Drought Stress Protection (Soil Injection)', category: 'Soil & Health Treatments (by DBH)', chemical: 'Hydratain', targetSpecies: 'All', treatmentType: 'Soil Injection', frequency: 'Annual', pricing: perInchOver12(18) },
  { id: 'soil-fertility-spring', name: 'Soil Fertility Treatment (Spring)', category: 'Soil & Health Treatments (by DBH)', chemical: 'Roots Fertilizer', targetSpecies: 'All', treatmentType: 'Soil Injection', frequency: 'Annual', pricing: perInchOver12(17) },
  { id: 'soil-fertility-summer', name: 'Soil Fertility Treatment (Summer)', category: 'Soil & Health Treatments (by DBH)', chemical: 'Roots Fertilizer', targetSpecies: 'All', treatmentType: 'Soil Injection', frequency: 'Annual', pricing: perInchOver12(17) },
  { id: 'soil-fertility-fall', name: 'Soil Fertility Treatment (Fall)', category: 'Soil & Health Treatments (by DBH)', chemical: 'Roots Fertilizer', targetSpecies: 'All', treatmentType: 'Soil Injection', frequency: 'Annual', pricing: perInchOver12(17) },
  { id: 'insecticide-basal-drench', name: 'Insecticide Treatment (Basal Drench)', category: 'Soil & Health Treatments (by DBH)', chemical: 'Imidacloprid 2F', targetSpecies: 'All', treatmentType: 'Basal Drench', frequency: 'Annual', pricing: perInchOver12(11) },
  { id: 'insecticide-trunk-injection', name: 'Insecticide Treatment (Trunk Injection)', category: 'Soil & Health Treatments (by DBH)', chemical: 'Emamectin Benzoate', targetSpecies: 'All', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(14) },

  // --- Pest & Disease Treatments (by DBH) — $200 base, +$X/inch over 12" ---
  { id: 'tlcb-treatment', name: 'Two Lined Chestnut Borer Treatment', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Emamectin Benzoate', targetSpecies: 'Oak', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(14) },
  { id: 'bbb-trunk-injection', name: 'Bronze Birch Borer Treatment (Trunk Injection)', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Emamectin Benzoate', targetSpecies: 'Birch', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(14) },
  { id: 'bbb-basal-drench', name: 'Bronze Birch Borer Treatment (Basal Drench)', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Imidacloprid 2F', targetSpecies: 'Birch', treatmentType: 'Basal Drench', frequency: 'Annual', pricing: perInchOver12(11) },
  { id: 'bur-oak-blight', name: 'Bur Oak Blight Treatment', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Propiconazole', targetSpecies: 'Bur Oak', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(12) },
  { id: 'eab-basal-drench', name: 'Emerald Ash Borer Treatment (Basal Drench)', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Imidacloprid 2F', targetSpecies: 'Ash', treatmentType: 'Basal Drench', frequency: 'Annual', pricing: perInchOver12(11) },
  { id: 'eab-trunk-injection', name: 'Emerald Ash Borer Treatment (Trunk Injection)', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Emamectin Benzoate', targetSpecies: 'Ash', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(14) },
  { id: 'verticillium-wilt', name: 'Verticillium Wilt Treatment', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Phosphorous Acid', treatmentType: 'Trunk injection', frequency: 'Annual', pricing: perInchOver12(14) },
  { id: 'growsmart', name: 'GrowSmart Treatment (Growth Regulator)', category: 'Pest & Disease Treatments (by DBH)', chemical: 'ShortStop', targetSpecies: 'Most species', treatmentType: 'Soil Injection', frequency: 'Every 3 Years', pricing: perInchOver12(14) },
  { id: 'tlcb-protection', name: 'Two Lined Chestnut Borer Protection', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Imidacloprid 2F', targetSpecies: 'All', treatmentType: 'Basal Drench', frequency: 'Annual', pricing: perInchOver12(11) },
  { id: 'oak-wilt-protection', name: 'Oak Wilt Protection', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Propiconazole', targetSpecies: 'Oak', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(12) },
  { id: 'dutch-elm-disease', name: 'Dutch Elm Disease Treatment', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Propiconazole', targetSpecies: 'Elm', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(12) },
  { id: 'dothistroma-trunk-injection', name: 'Dothistroma Trunk Injection', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Propiconazole', targetSpecies: 'Pine', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(14) },
  { id: 'diplodia-trunk-injection', name: 'Diplodia Trunk Injection', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Propiconazole', targetSpecies: 'Pine', treatmentType: 'Trunk injection', frequency: 'Every-Other-Year', pricing: perInchOver12(14) },
  { id: 'canker-disease-trunk-injection', name: 'Canker Disease Trunk Injection', category: 'Pest & Disease Treatments (by DBH)', chemical: 'Phosphorous Acid', targetSpecies: 'All', treatmentType: 'Trunk injection', frequency: 'Annual', pricing: perInchOver12(14) },
];

export const SERVICES_BY_ID: Map<string, Service> = new Map(
  SERVICES.map((s) => [s.id, s]),
);

// ----------------------------------------------------------------------------
// Pricing engine
// ----------------------------------------------------------------------------

export type PriceResult =
  | { ok: true; price: number }
  | { ok: false; reason: string };

/**
 * Compute the price of one service at a given DBH. Returns a structured
 * result so the caller can show either a dollar amount or a "consult" note.
 */
export function priceForDbh(service: Service, dbh: number): PriceResult {
  if (!Number.isFinite(dbh) || dbh <= 0) {
    return { ok: false, reason: 'Enter a DBH greater than 0.' };
  }

  const p = service.pricing;

  if (p.scheme === 'perInch') {
    const over = Math.max(0, dbh - p.baseDbhMax);
    return { ok: true, price: Math.round(p.basePrice + over * p.perInch) };
  }

  // banded
  for (const band of p.bands) {
    if (dbh >= band.minDbh && dbh <= band.maxDbh) {
      return { ok: true, price: band.price };
    }
  }

  // Above the largest band → apply the overflow rule.
  const top = p.bands[p.bands.length - 1];
  switch (p.overflow.kind) {
    case 'flat':
      return { ok: true, price: p.overflow.price };
    case 'perInch':
      return {
        ok: true,
        price: Math.round(top.price + (dbh - top.maxDbh) * p.overflow.perInch),
      };
    case 'consult':
      return {
        ok: false,
        reason: `Over ${top.maxDbh}" DBH — off the price chart. Consult PHC Manager (Connor) for pricing.`,
      };
  }
}

/**
 * A short human-readable description of how a service is priced, for showing
 * under the picker (e.g. "$200 base + $16/in over 12"" or "by DBH band").
 */
export function pricingSummary(service: Service): string {
  const p = service.pricing;
  if (p.scheme === 'perInch') {
    return `$${p.basePrice} up to ${p.baseDbhMax}", then +$${p.perInch}/in`;
  }
  const lo = p.bands[0].price;
  const hi = p.bands[p.bands.length - 1].price;
  const tail =
    p.overflow.kind === 'perInch'
      ? `, then +$${p.overflow.perInch}/in`
      : p.overflow.kind === 'flat'
        ? ` (max $${p.overflow.price})`
        : '';
  return `$${lo}–$${hi} by DBH band${tail}`;
}

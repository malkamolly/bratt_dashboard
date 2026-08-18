// ============================================================================
// Plant Health Program — pricing a tree's treatment
// ============================================================================
// The bridge between a tree the partner measured and the price book in
// phc-pricing.ts. Deliberately thin, and deliberately NOT a second price book:
// every number still comes from phc-pricing.ts, so our sales arborists and the
// partner quote from the same file. Change prices there and both follow.
//
// Safe in the browser (pure functions, no database), so the picker can preview a
// price before anything is saved.
// ============================================================================

import {
  SERVICES_BY_ID,
  priceForDbh,
  type Service,
} from './phc-pricing';
import { SPRAY_HEIGHT_LIMIT_FT } from './partner-types';

/** Money is integer cents everywhere. Never floats. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export type Quote =
  | { priced: true; unitPriceCents: number }
  /** Off the chart. The line still ships; Bratt prices it by hand. */
  | { priced: false; note: string };

export type TreeMeasurements = {
  dbh: number;
  heightFt: number | null;
};

/**
 * What one treatment costs for one tree.
 *
 * Two ways a line comes back unpriced, and both are on purpose — a wrong number
 * on a customer-facing work order is worse than an honest "we'll quote it":
 *
 *   1. The tree is bigger than the chart's largest band and the chart says
 *      consult the PHC manager (phc-pricing.ts decides this).
 *   2. The service is a single spray and the tree is over 25 ft, where the chart
 *      price is explicitly void. The price book flags these with heightLimit,
 *      but it can't know the height — only we have it, so this check lives here.
 */
export function quoteTreatment(
  service: Service,
  tree: TreeMeasurements,
): Quote {
  if (
    service.heightLimit &&
    tree.heightFt != null &&
    tree.heightFt > SPRAY_HEIGHT_LIMIT_FT
  ) {
    return {
      priced: false,
      note: `Tree is over ${SPRAY_HEIGHT_LIMIT_FT} ft — spray chart price doesn't apply. Bratt to quote.`,
    };
  }

  const result = priceForDbh(service, tree.dbh);
  if (!result.ok) return { priced: false, note: result.reason };

  return { priced: true, unitPriceCents: dollarsToCents(result.price) };
}

export function serviceById(id: string): Service | null {
  return SERVICES_BY_ID.get(id) ?? null;
}

/**
 * Orders the picker so the likely choice is near the top.
 *
 * A rep looking at an ash tree should not scroll past forty services to find
 * the emerald ash borer treatment. Matching is on the service's own
 * targetSpecies text against the species the rep typed — loose on purpose,
 * because "Green Ash" should still match a service targeting "Ash". This only
 * ever REORDERS: every service stays reachable, since a rep may be treating
 * something the species field doesn't capture.
 */
export function relevanceToSpecies(
  service: Service,
  species: string | null,
): number {
  if (!species) return 0;
  const target = service.targetSpecies?.toLowerCase();
  if (!target) return 0;

  const words = species
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2);

  for (const word of words) {
    if (target.includes(word)) return 2;
  }
  // Also try the other direction: service targets "Ash", species is "Ash".
  if (words.some((w) => w.includes(target))) return 1;
  return 0;
}

// ============================================================================
// Plant Health Program — shared types and constants (safe in the browser)
// ============================================================================
// Deliberately separate from partner-data.ts.
//
// partner-data.ts imports `next/headers` and the service-role Supabase client,
// so importing anything from it into a client component drags server-only code
// into the browser bundle and the build fails. Types alone would be fine (they
// are erased), but the status lists below are real runtime values that the forms
// need. They live here so the boundary is enforced by the module graph rather
// than by a comment asking people to be careful.
//
// Rule of thumb: values BOTH the server and a client component need go here.
// Anything that touches the database goes in partner-data.ts.
// ============================================================================

export type JobStatus = 'proposing' | 'sold' | 'dismissed';
export type HandoffStatus = 'draft' | 'sent' | 'received' | 'scheduled';

export const JOB_STATUSES: { value: JobStatus; label: string; hint: string }[] = [
  { value: 'proposing', label: 'Proposing', hint: 'Quoted, waiting on the customer' },
  { value: 'sold', label: 'Sold', hint: 'Customer said yes' },
  { value: 'dismissed', label: 'Dismissed', hint: 'Not moving forward' },
];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  proposing: 'Proposing',
  sold: 'Sold',
  dismissed: 'Dismissed',
};

export const HANDOFF_STATUS_LABELS: Record<HandoffStatus, string> = {
  draft: 'Draft',
  sent: 'Sent to Bratt',
  received: 'Received by Bratt',
  scheduled: 'Scheduled',
};

export type Proposal = {
  id: string;
  reference: string;
  /** Free text — their rep's name as typed. No managed roster (migration 073). */
  salespersonName: string | null;
  jobName: string;
  /** Exactly as the rep typed it. Never silently rewritten. */
  siteAddress: string;
  /** Google's canonical version, when the address resolved. */
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  jobStatus: JobStatus;
  handoffStatus: HandoffStatus;
  revision: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only populated by listProposals(), for the "3 trees" line on each card. */
  treeCount?: number;
};

/** Did the address resolve to a real place? Drives the map and the badge. */
export function hasLocation(p: Proposal): boolean {
  return p.latitude != null && p.longitude != null;
}

/** A proposal that has been sent to Bratt is frozen — edits need a new
 *  revision. One helper so every screen agrees on what "locked" means. */
export function isLocked(p: Proposal): boolean {
  return p.handoffStatus !== 'draft';
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

export type TreePhoto = {
  id: string;
  storagePath: string;
  /** Short-lived signed URL. The bucket is private — these are photos of
   *  someone's home — so there is no permanent public link. */
  url: string | null;
};

export type Tree = {
  id: string;
  proposalId: string;
  label: string;
  species: string | null;
  /** Diameter at breast height, inches. The only input current pricing uses. */
  dbh: number;
  heightFt: number | null;
  crownSpreadFt: number | null;
  notes: string | null;
  sortOrder: number;
  photos: TreePhoto[];
};

/**
 * Single-spray chart prices are void above this height — the tree becomes a
 * "consult the PHC manager" job. Collected here so the tree form can warn the
 * rep at entry rather than surprising them at pricing.
 */
export const SPRAY_HEIGHT_LIMIT_FT = 25;

/** Every tree needs at least one photo, so Connor can verify the call. */
export const MIN_PHOTOS_PER_TREE = 1;

/** Keeps a phone camera roll from being uploaded wholesale. */
export const MAX_PHOTOS_PER_TREE = 6;

/**
 * Common Twin Cities species, offered as suggestions rather than a closed list —
 * species drives which treatments are relevant, but a rep who finds something
 * unusual must still be able to type it.
 */
export const COMMON_SPECIES = [
  'Ash',
  'American Elm',
  'Basswood',
  'Birch',
  'Black Walnut',
  'Bur Oak',
  'Colorado Spruce',
  'Crabapple',
  'Hackberry',
  'Honeylocust',
  'Linden',
  'Norway Maple',
  'Pin Oak',
  'Red Maple',
  'Red Oak',
  'River Birch',
  'Silver Maple',
  'Sugar Maple',
  'White Pine',
  'White Spruce',
] as const;

// ---------------------------------------------------------------------------
// Treatments and the work order
// ---------------------------------------------------------------------------

export type Treatment = {
  id: string;
  treeId: string;
  /** Matches a Service.id in phc-pricing.ts. */
  serviceId: string;
  /** Price when it was quoted, in integer cents. Null when needsQuote. */
  unitPriceCents: number | null;
  /** Off the chart — Bratt prices this line by hand. */
  needsQuote: boolean;
  quoteNote: string | null;
  /** Resolved from the price book for display. Null if a service id was
   *  retired from phc-pricing.ts after being quoted. */
  serviceName: string | null;
  serviceCategory: string | null;
};

/** A tree with its treatments attached — what the work order is built from. */
export type TreeWithTreatments = Tree & { treatments: Treatment[] };

export type WorkOrder = {
  proposal: Proposal;
  trees: TreeWithTreatments[];
  /** Sum of every priced line. Unpriced lines are excluded, never guessed. */
  totalCents: number;
  /** Lines Bratt has to price by hand. */
  needsQuoteCount: number;
  /** Trees with no treatment picked yet — blocks sending. */
  treesWithoutTreatment: number;
  /** Trees with no photo — blocks sending. */
  treesWithoutPhoto: number;
};

/**
 * Can this work order go to Bratt yet?
 *
 * Deliberately strict about the two things Bratt cannot work without: a
 * treatment to perform, and a photo to verify it against. A total of $0 is fine
 * — every line may legitimately be "Bratt to quote".
 */
export function blockingIssues(order: WorkOrder): string[] {
  const issues: string[] = [];
  if (order.trees.length === 0) {
    issues.push('Add at least one tree.');
  }
  if (order.treesWithoutTreatment > 0) {
    issues.push(
      `${order.treesWithoutTreatment} ${
        order.treesWithoutTreatment === 1 ? 'tree has' : 'trees have'
      } no treatment picked.`,
    );
  }
  if (order.treesWithoutPhoto > 0) {
    issues.push(
      `${order.treesWithoutPhoto} ${
        order.treesWithoutPhoto === 1 ? 'tree has' : 'trees have'
      } no photo.`,
    );
  }
  return issues;
}

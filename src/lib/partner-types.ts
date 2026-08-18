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
  { value: 'proposing', label: 'Proposing', hint: "Quoted, waiting on the customer" },
  { value: 'sold', label: 'Sold', hint: 'Customer said yes' },
  { value: 'dismissed', label: 'Dismissed', hint: "Not moving forward" },
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

export type Salesperson = {
  id: string;
  name: string;
  active: boolean;
};

export type Proposal = {
  id: string;
  reference: string;
  salespersonId: string | null;
  salespersonName: string | null;
  jobName: string;
  siteAddress: string;
  customerName: string | null;
  customerPhone: string | null;
  accessNotes: string | null;
  jobStatus: JobStatus;
  handoffStatus: HandoffStatus;
  revision: number;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only populated by listProposals(), for the "3 trees" line on each card. */
  treeCount?: number;
};

/** A proposal that has been sent to Bratt is frozen — edits need a new
 *  revision. One helper so every screen agrees on what "locked" means. */
export function isLocked(p: Proposal): boolean {
  return p.handoffStatus !== 'draft';
}

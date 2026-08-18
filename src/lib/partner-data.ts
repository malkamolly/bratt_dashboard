// ============================================================================
// Plant Health Program — data access (SERVER ONLY)
// ============================================================================
// Every read and write for the partner hub goes through this file.
//
// WHY IT ALL LIVES HERE: partner users hold a shared-password cookie, not a
// Supabase session (see partner-auth.ts). RLS cannot see them — there is no
// auth.uid() and no allowed_emails row — so the partner tables grant nothing to
// the anon key. Access therefore uses adminClient() (service role, bypasses
// RLS), and the ONLY thing standing between the internet and this data is the
// cookie check. Which means:
//
//   Every exported function here must be called from server code that has
//   already called requirePartner(). Never import this into a client component.
//
// Migrations: 071_partner_php_proposals.sql, 072_partner_proposal_defaults.sql
// ============================================================================

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { adminClient } from './supabase';
import { PARTNER_COOKIE, isValidPartnerCookie } from './partner-auth';
import { isLocked, type JobStatus, type HandoffStatus, type Proposal, type Salesperson } from './partner-types';

// Re-exported so server-side callers can keep importing everything from one
// place. Client components must import these from partner-types.ts instead —
// importing them from here pulls next/headers into the browser bundle.
export {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  isLocked,
} from './partner-types';
export type { JobStatus, HandoffStatus, Proposal, Salesperson } from './partner-types';

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

/**
 * Guards a partner page or action. Bounces anyone without a valid partner
 * cookie to the sign-in screen.
 *
 * Middleware already gates /partner/* — this is the second lock, for server
 * actions and route handlers where a redirect at the edge isn't enough. Cheap
 * to call (one hash, no network), so call it in every action.
 */
export async function requirePartner(): Promise<void> {
  const jar = await cookies();
  const ok = await isValidPartnerCookie(jar.get(PARTNER_COOKIE)?.value);
  if (!ok) redirect('/partner/login');
}

// ---------------------------------------------------------------------------
// Salespeople
// ---------------------------------------------------------------------------

/**
 * Their reps, for the picklist. A picklist rather than a free-text field
 * because with one shared login there is no identity behind a proposal, so a
 * typed name is both typo-prone and useless as an audit trail.
 */
export async function listSalespeople(): Promise<Salesperson[]> {
  const db = adminClient();
  const { data, error } = await db
    .from('partner_salespeople')
    .select('id, name, active')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw new Error(`Could not load salespeople: ${error.message}`);
  return (data ?? []) as Salesperson[];
}

/**
 * Adds a rep to the picklist, or returns the existing one if the name is
 * already there (case-insensitively — the unique index is on lower(name)).
 *
 * This is self-service on purpose: we don't know their roster yet, and making
 * Bratt seed it first would leave the hub unusable on day one. Names follow the
 * house convention — First Name + Last Initial.
 */
export async function addSalesperson(rawName: string): Promise<Salesperson> {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('A name is required.');

  const db = adminClient();

  const { data: existing } = await db
    .from('partner_salespeople')
    .select('id, name, active')
    .ilike('name', name)
    .maybeSingle();

  if (existing) {
    // Reactivate someone Bratt had deactivated, rather than erroring on the
    // unique index.
    if (!existing.active) {
      await db.from('partner_salespeople').update({ active: true }).eq('id', existing.id);
    }
    return { ...existing, active: true } as Salesperson;
  }

  const { data, error } = await db
    .from('partner_salespeople')
    .insert({ name })
    .select('id, name, active')
    .single();

  if (error) throw new Error(`Could not add ${name}: ${error.message}`);
  return data as Salesperson;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

// The shape Supabase returns for our join. The nested select comes back as
// either an object or null depending on the FK, hence the loose type.
//
// The `as unknown as ProposalRow` casts below are needed because the Supabase
// client can't infer the shape of a relational select (`partner_salespeople (
// name )`) without generated database types, and widens it to a union that
// includes an error shape. The runtime data is exactly ProposalRow.
type ProposalRow = {
  id: string;
  reference: string;
  salesperson_id: string | null;
  job_name: string;
  site_address: string;
  customer_name: string | null;
  customer_phone: string | null;
  access_notes: string | null;
  job_status: JobStatus;
  handoff_status: HandoffStatus;
  revision: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  partner_salespeople?: { name: string } | null;
};

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    reference: row.reference,
    salespersonId: row.salesperson_id,
    salespersonName: row.partner_salespeople?.name ?? null,
    jobName: row.job_name,
    siteAddress: row.site_address,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    accessNotes: row.access_notes,
    jobStatus: row.job_status,
    handoffStatus: row.handoff_status,
    revision: row.revision,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROPOSAL_SELECT =
  'id, reference, salesperson_id, job_name, site_address, customer_name, ' +
  'customer_phone, access_notes, job_status, handoff_status, revision, ' +
  'sent_at, created_at, updated_at, partner_salespeople ( name )';

/**
 * Every proposal, newest first, with a tree count for the list.
 *
 * Deliberately NOT filtered by salesperson: they share one login, so scoping to
 * "mine" is impossible and, for a team of a few reps covering for each other,
 * undesirable anyway.
 */
export async function listProposals(): Promise<Proposal[]> {
  const db = adminClient();

  const { data, error } = await db
    .from('partner_proposals')
    .select(PROPOSAL_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not load proposals: ${error.message}`);
  const proposals = ((data ?? []) as unknown as ProposalRow[]).map(toProposal);
  if (proposals.length === 0) return proposals;

  // One extra query for tree counts, rather than N+1 or a view. Small data.
  const { data: trees } = await db
    .from('partner_proposal_trees')
    .select('proposal_id')
    .in('proposal_id', proposals.map((p) => p.id));

  const counts = new Map<string, number>();
  for (const t of (trees ?? []) as { proposal_id: string }[]) {
    counts.set(t.proposal_id, (counts.get(t.proposal_id) ?? 0) + 1);
  }

  return proposals.map((p) => ({ ...p, treeCount: counts.get(p.id) ?? 0 }));
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const db = adminClient();
  const { data, error } = await db
    .from('partner_proposals')
    .select(PROPOSAL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Could not load proposal: ${error.message}`);
  return data ? toProposal(data as unknown as ProposalRow) : null;
}

export type ProposalInput = {
  salespersonId: string | null;
  jobName: string;
  siteAddress: string;
  customerName: string | null;
  customerPhone: string | null;
  accessNotes: string | null;
  jobStatus: JobStatus;
};

/**
 * Creates the proposal and returns it. The reference ('PHP-0007') is generated
 * by the database (migration 072), not here — building it in app code would
 * mean read-then-write, and two reps starting at the same moment could collide.
 */
export async function createProposal(input: ProposalInput): Promise<Proposal> {
  const db = adminClient();
  const { data, error } = await db
    .from('partner_proposals')
    .insert({
      salesperson_id: input.salespersonId,
      job_name: input.jobName,
      site_address: input.siteAddress,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      access_notes: input.accessNotes,
      job_status: input.jobStatus,
    })
    .select(PROPOSAL_SELECT)
    .single();

  if (error) throw new Error(`Could not create the proposal: ${error.message}`);
  return toProposal(data as unknown as ProposalRow);
}

/**
 * Updates job details. Refuses to touch a proposal that has been sent to
 * Bratt — those are frozen until someone starts a revision, so the PDF in
 * Bratt's inbox always matches a stored record.
 */
export async function updateProposal(
  id: string,
  input: ProposalInput,
): Promise<Proposal> {
  const current = await getProposal(id);
  if (!current) throw new Error('That proposal no longer exists.');
  if (isLocked(current)) {
    throw new Error(
      'This work order has been sent to Bratt and is locked. Start a revision to change it.',
    );
  }

  const db = adminClient();
  const { data, error } = await db
    .from('partner_proposals')
    .update({
      salesperson_id: input.salespersonId,
      job_name: input.jobName,
      site_address: input.siteAddress,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      access_notes: input.accessNotes,
      job_status: input.jobStatus,
    })
    .eq('id', id)
    .select(PROPOSAL_SELECT)
    .single();

  if (error) throw new Error(`Could not save the proposal: ${error.message}`);
  return toProposal(data as unknown as ProposalRow);
}

/**
 * The partner's own sales status (proposing / sold / dismissed). Allowed even
 * on a sent work order: whether THEY closed the deal is their business and
 * doesn't alter what Bratt was asked to do.
 */
export async function setJobStatus(id: string, status: JobStatus): Promise<void> {
  const db = adminClient();
  const { error } = await db
    .from('partner_proposals')
    .update({ job_status: status })
    .eq('id', id);
  if (error) throw new Error(`Could not update the status: ${error.message}`);
}

/** Deletes a draft. Trees, photos, and treatments cascade (migration 071). */
export async function deleteProposal(id: string): Promise<void> {
  const current = await getProposal(id);
  if (!current) return;
  if (isLocked(current)) {
    throw new Error('This work order has been sent to Bratt and cannot be deleted.');
  }
  const db = adminClient();
  const { error } = await db.from('partner_proposals').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the proposal: ${error.message}`);
}

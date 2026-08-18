'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addTreatment,
  createProposal,
  createTree,
  deleteProposal,
  deleteTree,
  deleteTreePhoto,
  getTree,
  removeTreatment,
  repriceTree,
  requirePartner,
  sendWorkOrder,
  setJobStatus,
  startRevision,
  updateProposal,
  updateTree,
  type JobStatus,
  type ProposalInput,
  type TreeInput,
} from '@/lib/partner-data';

/**
 * Server actions for the Plant Health Program.
 *
 * Every one of these calls requirePartner() FIRST. Middleware already gates
 * /partner/* page requests, but a server action is its own endpoint — without
 * the check here, anyone who knew the action id could invoke it.
 *
 * Errors are RETURNED as state, not thrown, so forms can render them inline.
 * (Throwing from an action that redirects back to its own page also loses the
 * form's hidden action id, which silently breaks the retry — the bug that bit
 * the sign-in screen.)
 */

export type FormState = { error: string | null };

/** Trim to null so empty form fields don't become empty strings in the DB. */
function optional(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? null : v;
}

function required(form: FormData, key: string, label: string): string {
  const v = String(form.get(key) ?? '').trim();
  if (!v) throw new Error(`${label} is required.`);
  return v;
}

/** A measurement in inches or feet. Blank is allowed unless `label` is given. */
function measurement(
  form: FormData,
  key: string,
  label?: string,
): number | null {
  const raw = String(form.get(key) ?? '').replace(/[^0-9.]/g, '');
  if (raw === '') {
    if (label) throw new Error(`${label} is required.`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label ?? 'That measurement'} must be a number bigger than zero.`);
  }
  return n;
}

function jobStatusFrom(form: FormData): JobStatus {
  const v = String(form.get('jobStatus') ?? 'proposing');
  return v === 'sold' || v === 'dismissed' ? v : 'proposing';
}

function proposalInputFrom(form: FormData): ProposalInput {
  return {
    salespersonName: optional(form, 'salespersonName'),
    jobName: required(form, 'jobName', 'Job name'),
    siteAddress: required(form, 'siteAddress', 'Site address'),
    jobStatus: jobStatusFrom(form),
  };
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

/**
 * Creates a proposal and goes straight to it.
 *
 * Saving on step one is deliberate: the next steps are trees and photos, in a
 * driveway, on a phone, on a bad connection. A rep who loses eight trees' worth
 * of entry once will not use this tool again.
 */
export async function createProposalAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requirePartner();

  let id: string;
  try {
    const proposal = await createProposal(proposalInputFrom(form));
    id = proposal.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }

  revalidatePath('/partner');
  redirect(`/partner/proposals/${id}`);
}

export async function updateProposalAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requirePartner();

  const id = String(form.get('id') ?? '');
  try {
    await updateProposal(id, proposalInputFrom(form));
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }

  revalidatePath('/partner');
  revalidatePath(`/partner/proposals/${id}`);
  redirect(`/partner/proposals/${id}`);
}

/** Their own sales status. Allowed even once the work order is with Bratt. */
export async function setJobStatusAction(form: FormData): Promise<void> {
  await requirePartner();
  const id = String(form.get('id') ?? '');
  await setJobStatus(id, jobStatusFrom(form));
  revalidatePath('/partner');
  revalidatePath(`/partner/proposals/${id}`);
}

export async function deleteProposalAction(form: FormData): Promise<void> {
  await requirePartner();
  await deleteProposal(String(form.get('id') ?? ''));
  revalidatePath('/partner');
  redirect('/partner');
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

function treeInputFrom(form: FormData): TreeInput {
  return {
    label: required(form, 'label', 'Tree location'),
    species: optional(form, 'species'),
    dbh: measurement(form, 'dbh', 'Trunk diameter (DBH)')!,
    heightFt: measurement(form, 'heightFt'),
    crownSpreadFt: measurement(form, 'crownSpreadFt'),
    notes: optional(form, 'notes'),
  };
}

/**
 * Adds a tree and returns its id, so the browser can upload the photos it is
 * holding against a real row.
 *
 * Photos can't be part of this submission: a server action posts through the
 * React runtime with its own body limit, and phone photos are large. The form
 * creates the tree first, then POSTs each downscaled image to /partner/photos.
 */
export type TreeState = { error: string | null; treeId?: string };

export async function createTreeAction(
  _prev: TreeState,
  form: FormData,
): Promise<TreeState> {
  await requirePartner();
  const proposalId = String(form.get('proposalId') ?? '');

  try {
    const tree = await createTree(proposalId, treeInputFrom(form));
    revalidatePath(`/partner/proposals/${proposalId}`);
    revalidatePath('/partner');
    return { error: null, treeId: tree.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function updateTreeAction(
  _prev: TreeState,
  form: FormData,
): Promise<TreeState> {
  await requirePartner();
  const id = String(form.get('id') ?? '');

  try {
    const proposalId = await updateTree(id, treeInputFrom(form));
    // Changing DBH or height changes the price. Without this, an edit would
    // leave stale prices attached to the new measurements.
    await repriceTree(id);
    revalidatePath(`/partner/proposals/${proposalId}`);
    revalidatePath(`/partner/proposals/${proposalId}/work-order`);
    return { error: null, treeId: id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' };
  }
}

export async function deleteTreeAction(form: FormData): Promise<void> {
  await requirePartner();
  const proposalId = await deleteTree(String(form.get('id') ?? ''));
  revalidatePath(`/partner/proposals/${proposalId}`);
  revalidatePath('/partner');
  redirect(`/partner/proposals/${proposalId}`);
}

export async function deleteTreePhotoAction(form: FormData): Promise<void> {
  await requirePartner();
  const photoId = String(form.get('id') ?? '');
  const treeId = await deleteTreePhoto(photoId);
  const tree = await getTree(treeId);
  if (tree) revalidatePath(`/partner/proposals/${tree.proposalId}`);
}

// ---------------------------------------------------------------------------
// Treatments
// ---------------------------------------------------------------------------

export async function addTreatmentAction(form: FormData): Promise<void> {
  await requirePartner();
  const treeId = String(form.get('treeId') ?? '');
  const serviceId = String(form.get('serviceId') ?? '');
  await addTreatment(treeId, serviceId);

  const tree = await getTree(treeId);
  if (tree) {
    revalidatePath(`/partner/proposals/${tree.proposalId}`);
    revalidatePath(`/partner/proposals/${tree.proposalId}/trees/${treeId}/treatments`);
    revalidatePath(`/partner/proposals/${tree.proposalId}/work-order`);
  }
}

export async function removeTreatmentAction(form: FormData): Promise<void> {
  await requirePartner();
  const treeId = await removeTreatment(String(form.get('id') ?? ''));
  const tree = await getTree(treeId);
  if (tree) {
    revalidatePath(`/partner/proposals/${tree.proposalId}`);
    revalidatePath(`/partner/proposals/${tree.proposalId}/trees/${treeId}/treatments`);
    revalidatePath(`/partner/proposals/${tree.proposalId}/work-order`);
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type SendState = { error: string | null; issues?: string[]; warning?: string };

/**
 * Accepts the work order and sends it to Bratt.
 *
 * A mail failure is a WARNING, not an error: the work order is saved, locked, and
 * its PDF stored, so telling the rep "nothing happened" would be false. They see
 * that it went through but the email didn't, and it can be retried.
 */
export async function sendWorkOrderAction(
  _prev: SendState,
  form: FormData,
): Promise<SendState> {
  await requirePartner();
  const id = String(form.get('id') ?? '');

  let result: Awaited<ReturnType<typeof sendWorkOrder>>;
  try {
    result = await sendWorkOrder(id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not send the work order.' };
  }

  revalidatePath('/partner');
  revalidatePath(`/partner/proposals/${id}`);
  revalidatePath(`/partner/proposals/${id}/work-order`);

  if (!result.sent) {
    return { error: 'This work order is not ready to send yet.', issues: result.issues };
  }
  if (!result.mail.ok) {
    return { error: null, warning: result.mail.error };
  }
  return { error: null };
}

export async function startRevisionAction(form: FormData): Promise<void> {
  await requirePartner();
  const id = String(form.get('id') ?? '');
  await startRevision(id);
  revalidatePath('/partner');
  revalidatePath(`/partner/proposals/${id}`);
  redirect(`/partner/proposals/${id}`);
}

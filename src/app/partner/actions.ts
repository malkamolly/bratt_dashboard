'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addSalesperson,
  createProposal,
  deleteProposal,
  requirePartner,
  setJobStatus,
  updateProposal,
  type JobStatus,
  type ProposalInput,
} from '@/lib/partner-data';

/**
 * Server actions for the Plant Health Program.
 *
 * Every one of these calls requirePartner() FIRST. Middleware already gates
 * /partner/* page requests, but a server action is its own endpoint — without
 * the check here, anyone who knew the action id could invoke it.
 */

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

function jobStatusFrom(form: FormData): JobStatus {
  const v = String(form.get('jobStatus') ?? 'proposing');
  return v === 'sold' || v === 'dismissed' ? v : 'proposing';
}

/**
 * Reads the salesperson from the form. Two ways to arrive: picking an existing
 * rep, or typing a new name (which adds them to the picklist). Self-service
 * because we don't have their roster yet and an empty picklist would otherwise
 * make the hub unusable.
 */
async function resolveSalesperson(form: FormData): Promise<string | null> {
  const newName = String(form.get('newSalespersonName') ?? '').trim();
  if (newName) return (await addSalesperson(newName)).id;

  const picked = String(form.get('salespersonId') ?? '').trim();
  return picked === '' || picked === 'new' ? null : picked;
}

function inputFrom(form: FormData, salespersonId: string | null): ProposalInput {
  return {
    salespersonId,
    jobName: required(form, 'jobName', 'Job name'),
    siteAddress: required(form, 'siteAddress', 'Site address'),
    customerName: optional(form, 'customerName'),
    customerPhone: optional(form, 'customerPhone'),
    accessNotes: optional(form, 'accessNotes'),
    jobStatus: jobStatusFrom(form),
  };
}

/**
 * Creates a proposal and goes straight to it.
 *
 * Saving on step one is deliberate: the next steps are trees and photos, in a
 * driveway, on a phone, on a bad connection. A rep who loses eight trees'
 * worth of entry once will not use this tool again.
 *
 * Errors are returned as state rather than thrown, so the form can render them
 * inline. (Throwing from an action that redirects back to its own page also
 * loses the form's action id, which silently breaks the retry — the same bug
 * that bit the sign-in screen.)
 */
export type FormState = { error: string | null };

export async function createProposalAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  await requirePartner();

  let id: string;
  try {
    const salespersonId = await resolveSalesperson(form);
    const proposal = await createProposal(inputFrom(form, salespersonId));
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
    const salespersonId = await resolveSalesperson(form);
    await updateProposal(id, inputFrom(form, salespersonId));
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
  const status = jobStatusFrom(form);
  await setJobStatus(id, status);
  revalidatePath('/partner');
  revalidatePath(`/partner/proposals/${id}`);
}

export async function deleteProposalAction(form: FormData): Promise<void> {
  await requirePartner();
  await deleteProposal(String(form.get('id') ?? ''));
  revalidatePath('/partner');
  redirect('/partner');
}

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
// Migrations: 071_partner_php_proposals.sql, 072_partner_proposal_defaults.sql,
//             073_partner_proposal_revisions_to_spec.sql
// ============================================================================

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { adminClient } from './supabase';
import { PARTNER_COOKIE, isValidPartnerCookie } from './partner-auth';
import { geocodeAddress } from './geocode';
import {
  isLocked,
  MAX_PHOTOS_PER_TREE,
  type JobStatus,
  type Proposal,
  type Tree,
  type TreePhoto,
} from './partner-types';

// Re-exported so server-side callers can keep importing everything from one
// place. Client components must import these from partner-types.ts instead —
// importing them from here pulls next/headers into the browser bundle.
export {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  HANDOFF_STATUS_LABELS,
  COMMON_SPECIES,
  SPRAY_HEIGHT_LIMIT_FT,
  MIN_PHOTOS_PER_TREE,
  MAX_PHOTOS_PER_TREE,
  isLocked,
  hasLocation,
} from './partner-types';
export type {
  JobStatus,
  HandoffStatus,
  Proposal,
  Tree,
  TreePhoto,
} from './partner-types';

export const PHOTO_BUCKET = 'partner-photos';

/** How long a photo's signed URL stays valid. Long enough to work through a
 *  proposal, short enough that a leaked URL is worthless tomorrow. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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

/** Same check, for route handlers that need a status code, not a redirect. */
export async function isPartnerRequest(): Promise<boolean> {
  const jar = await cookies();
  return isValidPartnerCookie(jar.get(PARTNER_COOKIE)?.value);
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

type ProposalRow = {
  id: string;
  reference: string;
  salesperson_name: string | null;
  job_name: string;
  site_address: string;
  formatted_address: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  job_status: JobStatus;
  handoff_status: Proposal['handoffStatus'];
  revision: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

// The `as unknown as` casts below are needed throughout: our selects are built
// from string constants, and without generated Supabase database types the
// client widens the result to a union that includes an error shape. The runtime
// data is exactly the row type named in each cast.

/** Postgres numeric arrives as a string over the wire; make it a number. */
function num(v: string | number | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    reference: row.reference,
    salespersonName: row.salesperson_name,
    jobName: row.job_name,
    siteAddress: row.site_address,
    formattedAddress: row.formatted_address,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    jobStatus: row.job_status,
    handoffStatus: row.handoff_status,
    revision: row.revision,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROPOSAL_SELECT =
  'id, reference, salesperson_name, job_name, site_address, formatted_address, ' +
  'latitude, longitude, job_status, handoff_status, revision, sent_at, ' +
  'created_at, updated_at';

/**
 * Every proposal, newest first, with a tree count for the list.
 *
 * Deliberately NOT filtered by salesperson: they share one login, so scoping to
 * "mine" is impossible and, for a few reps covering for each other, undesirable
 * anyway.
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
  salespersonName: string | null;
  jobName: string;
  siteAddress: string;
  jobStatus: JobStatus;
};

/**
 * Geocoding result folded into the columns we store.
 *
 * A failure is NOT fatal: an address Google can't resolve is still worth saving
 * — the rep may know the site better than the map does, and refusing to save
 * would be worse than saving without coordinates. The screens show whether an
 * address was confirmed, so an unverified one is visible rather than silent.
 */
async function locationColumns(address: string) {
  const geo = await geocodeAddress(address);
  return geo.ok
    ? { formatted_address: geo.formatted, latitude: geo.lat, longitude: geo.lng }
    : { formatted_address: null, latitude: null, longitude: null };
}

/**
 * Creates the proposal and returns it. The reference ('PHP-0007') is generated
 * by the database (migration 072), not here — building it in app code would mean
 * read-then-write, and two reps starting at the same moment could collide.
 */
export async function createProposal(input: ProposalInput): Promise<Proposal> {
  const db = adminClient();
  const { data, error } = await db
    .from('partner_proposals')
    .insert({
      salesperson_name: input.salespersonName,
      job_name: input.jobName,
      site_address: input.siteAddress,
      job_status: input.jobStatus,
      ...(await locationColumns(input.siteAddress)),
    })
    .select(PROPOSAL_SELECT)
    .single();

  if (error) throw new Error(`Could not create the proposal: ${error.message}`);
  return toProposal(data as unknown as ProposalRow);
}

/**
 * Updates job details. Refuses to touch a proposal that has been sent to Bratt —
 * those are frozen until someone starts a revision, so the PDF in Bratt's inbox
 * always matches a stored record.
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

  // Only re-geocode when the typed address actually changed — otherwise every
  // trivial edit costs a Google call.
  const location =
    input.siteAddress.trim() === current.siteAddress.trim()
      ? {}
      : await locationColumns(input.siteAddress);

  const db = adminClient();
  const { data, error } = await db
    .from('partner_proposals')
    .update({
      salesperson_name: input.salespersonName,
      job_name: input.jobName,
      site_address: input.siteAddress,
      job_status: input.jobStatus,
      ...location,
    })
    .eq('id', id)
    .select(PROPOSAL_SELECT)
    .single();

  if (error) throw new Error(`Could not save the proposal: ${error.message}`);
  return toProposal(data as unknown as ProposalRow);
}

/**
 * The partner's own sales status (proposing / sold / dismissed). Allowed even on
 * a sent work order: whether THEY closed the deal is their business and doesn't
 * alter what Bratt was asked to do.
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

  // Clear the stored files too — the cascade drops the rows but would leave the
  // photos orphaned in the bucket forever.
  const trees = await listTrees(id);
  const paths = trees.flatMap((t) => t.photos.map((p) => p.storagePath));
  const db = adminClient();
  if (paths.length) await db.storage.from(PHOTO_BUCKET).remove(paths);

  const { error } = await db.from('partner_proposals').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the proposal: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

type TreeRow = {
  id: string;
  proposal_id: string;
  label: string;
  species: string | null;
  dbh: string | number;
  height_ft: string | number | null;
  crown_spread_ft: string | number | null;
  notes: string | null;
  sort_order: number;
};

const TREE_SELECT =
  'id, proposal_id, label, species, dbh, height_ft, crown_spread_ft, notes, sort_order';

function toTree(row: TreeRow, photos: TreePhoto[] = []): Tree {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    label: row.label,
    species: row.species,
    dbh: num(row.dbh) ?? 0,
    heightFt: num(row.height_ft),
    crownSpreadFt: num(row.crown_spread_ft),
    notes: row.notes,
    sortOrder: row.sort_order,
    photos,
  };
}

/**
 * Mints short-lived signed URLs for a batch of photos.
 *
 * The bucket is private, so there is no permanent link to hand a browser. One
 * batched call rather than one per photo — a proposal with six trees and three
 * photos each would otherwise make eighteen round trips.
 */
async function signPhotos(
  rows: { id: string; storage_path: string }[],
): Promise<Map<string, TreePhoto>> {
  const out = new Map<string, TreePhoto>();
  if (rows.length === 0) return out;

  const db = adminClient();
  const { data } = await db.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );

  const urlByPath = new Map<string, string | null>();
  for (const s of data ?? []) {
    if (s.path) urlByPath.set(s.path, s.signedUrl ?? null);
  }

  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      storagePath: r.storage_path,
      url: urlByPath.get(r.storage_path) ?? null,
    });
  }
  return out;
}

/** Every tree on a proposal, in display order, with signed photo URLs. */
export async function listTrees(proposalId: string): Promise<Tree[]> {
  const db = adminClient();

  const { data, error } = await db
    .from('partner_proposal_trees')
    .select(TREE_SELECT)
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Could not load trees: ${error.message}`);
  const rows = (data ?? []) as unknown as TreeRow[];
  if (rows.length === 0) return [];

  const { data: photoRows } = await db
    .from('partner_tree_photos')
    .select('id, tree_id, storage_path, sort_order')
    .in('tree_id', rows.map((r) => r.id))
    .order('sort_order', { ascending: true });

  const photos = (photoRows ?? []) as {
    id: string;
    tree_id: string;
    storage_path: string;
  }[];
  const signed = await signPhotos(photos);

  const byTree = new Map<string, TreePhoto[]>();
  for (const p of photos) {
    const photo = signed.get(p.id);
    if (!photo) continue;
    byTree.set(p.tree_id, [...(byTree.get(p.tree_id) ?? []), photo]);
  }

  return rows.map((r) => toTree(r, byTree.get(r.id) ?? []));
}

export async function getTree(id: string): Promise<Tree | null> {
  const db = adminClient();
  const { data } = await db
    .from('partner_proposal_trees')
    .select('proposal_id')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const trees = await listTrees((data as { proposal_id: string }).proposal_id);
  return trees.find((t) => t.id === id) ?? null;
}

export type TreeInput = {
  label: string;
  species: string | null;
  dbh: number;
  heightFt: number | null;
  crownSpreadFt: number | null;
  notes: string | null;
};

/** Refuses to touch trees on a work order Bratt already has. */
async function assertProposalEditable(proposalId: string): Promise<void> {
  const proposal = await getProposal(proposalId);
  if (!proposal) throw new Error('That proposal no longer exists.');
  if (isLocked(proposal)) {
    throw new Error(
      'This work order has been sent to Bratt and is locked. Start a revision to change it.',
    );
  }
}

export async function createTree(
  proposalId: string,
  input: TreeInput,
): Promise<Tree> {
  await assertProposalEditable(proposalId);
  const db = adminClient();

  // Append to the end of the list.
  const { data: last } = await db
    .from('partner_proposal_trees')
    .select('sort_order')
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await db
    .from('partner_proposal_trees')
    .insert({
      proposal_id: proposalId,
      label: input.label,
      species: input.species,
      dbh: input.dbh,
      height_ft: input.heightFt,
      crown_spread_ft: input.crownSpreadFt,
      notes: input.notes,
      sort_order: sortOrder,
    })
    .select(TREE_SELECT)
    .single();

  if (error) throw new Error(`Could not add the tree: ${error.message}`);
  return toTree(data as unknown as TreeRow);
}

export async function updateTree(id: string, input: TreeInput): Promise<string> {
  const tree = await getTree(id);
  if (!tree) throw new Error('That tree no longer exists.');
  await assertProposalEditable(tree.proposalId);

  const db = adminClient();
  const { error } = await db
    .from('partner_proposal_trees')
    .update({
      label: input.label,
      species: input.species,
      dbh: input.dbh,
      height_ft: input.heightFt,
      crown_spread_ft: input.crownSpreadFt,
      notes: input.notes,
    })
    .eq('id', id);

  if (error) throw new Error(`Could not save the tree: ${error.message}`);
  return tree.proposalId;
}

export async function deleteTree(id: string): Promise<string> {
  const tree = await getTree(id);
  if (!tree) throw new Error('That tree no longer exists.');
  await assertProposalEditable(tree.proposalId);

  const db = adminClient();
  // Remove the files before the rows — once the rows are gone so are the paths,
  // and the bucket would keep the photos forever.
  const paths = tree.photos.map((p) => p.storagePath);
  if (paths.length) await db.storage.from(PHOTO_BUCKET).remove(paths);

  const { error } = await db.from('partner_proposal_trees').delete().eq('id', id);
  if (error) throw new Error(`Could not delete the tree: ${error.message}`);
  return tree.proposalId;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * Stores one photo for a tree and records it.
 *
 * Uploads come through our server rather than going straight from the browser to
 * Supabase Storage: a partner has no Supabase session, so the browser holds no
 * credential any storage policy would accept. The bytes arrive at a route gated
 * by the partner cookie, and the service role writes them.
 */
export async function addTreePhoto(
  treeId: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<TreePhoto> {
  const tree = await getTree(treeId);
  if (!tree) throw new Error('That tree no longer exists.');
  await assertProposalEditable(tree.proposalId);

  if (tree.photos.length >= MAX_PHOTOS_PER_TREE) {
    throw new Error(`That tree already has ${MAX_PHOTOS_PER_TREE} photos.`);
  }

  const db = adminClient();
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  // The path includes the proposal so a stray file can be traced to a job.
  const path = `trees/${tree.proposalId}/${treeId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (upErr) throw new Error(`Could not upload the photo: ${upErr.message}`);

  const { data, error } = await db
    .from('partner_tree_photos')
    .insert({
      tree_id: treeId,
      storage_path: path,
      sort_order: tree.photos.length,
    })
    .select('id, storage_path')
    .single();

  if (error) {
    // Don't leave a file behind that nothing points at.
    await db.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(`Could not record the photo: ${error.message}`);
  }

  const row = data as { id: string; storage_path: string };
  const signed = await signPhotos([row]);
  return signed.get(row.id)!;
}

export async function deleteTreePhoto(photoId: string): Promise<string> {
  const db = adminClient();
  const { data } = await db
    .from('partner_tree_photos')
    .select('id, tree_id, storage_path')
    .eq('id', photoId)
    .maybeSingle();
  if (!data) throw new Error('That photo no longer exists.');

  const row = data as { id: string; tree_id: string; storage_path: string };
  const tree = await getTree(row.tree_id);
  if (tree) await assertProposalEditable(tree.proposalId);

  await db.storage.from(PHOTO_BUCKET).remove([row.storage_path]);
  const { error } = await db.from('partner_tree_photos').delete().eq('id', photoId);
  if (error) throw new Error(`Could not delete the photo: ${error.message}`);
  return row.tree_id;
}

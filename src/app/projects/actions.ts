'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAllowedUser, isOwner } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { isStatus, type Status } from './status';

// Every action re-checks ownership server-side. The middleware already blocks
// non-owners from the route, but server actions can be invoked directly, so we
// never trust the route guard alone.
async function requireOwnerAction() {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isOwner(u.email)) redirect('/access-denied');
  return u;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function addProject(formData: FormData): Promise<void> {
  const u = await requireOwnerAction();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    revalidatePath('/projects');
    return;
  }

  const supabase = await serverClient();
  await supabase
    .from('personal_projects')
    .insert({ owner_email: u.email, name });

  revalidatePath('/projects');
}

export async function renameProject(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get('id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!id || !name) {
    revalidatePath('/projects');
    return;
  }

  const supabase = await serverClient();
  await supabase.from('personal_projects').update({ name }).eq('id', id);

  revalidatePath('/projects');
}

export async function deleteProject(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  // Items cascade-delete in the database (ON DELETE CASCADE).
  const supabase = await serverClient();
  await supabase.from('personal_projects').delete().eq('id', id);

  revalidatePath('/projects');
}

/** Called from the client status control. Plain args, not a form. */
export async function setProjectStatus(
  id: string,
  status: Status,
): Promise<void> {
  await requireOwnerAction();
  if (!id || !isStatus(status)) return;

  const supabase = await serverClient();
  await supabase.from('personal_projects').update({ status }).eq('id', id);

  revalidatePath('/projects');
}

/**
 * Persist a new project order after a drag-and-drop. The client sends the full
 * list of project ids in their new order; we write each one's array index back
 * as its sort_order so the next render matches.
 */
export async function reorderProjects(orderedIds: string[]): Promise<void> {
  await requireOwnerAction();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;

  const supabase = await serverClient();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase
        .from('personal_projects')
        .update({ sort_order: i })
        .eq('id', id),
    ),
  );

  revalidatePath('/projects');
}

// ---------------------------------------------------------------------------
// Items (tasks + sub-tasks share one table; a sub-task has a parent_item_id)
// ---------------------------------------------------------------------------

export async function addItem(formData: FormData): Promise<void> {
  const u = await requireOwnerAction();
  const projectId = String(formData.get('project_id') ?? '').trim();
  const parentRaw = String(formData.get('parent_item_id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!projectId || !title) {
    revalidatePath('/projects');
    return;
  }

  const supabase = await serverClient();
  await supabase.from('personal_project_items').insert({
    owner_email: u.email,
    project_id: projectId,
    parent_item_id: parentRaw || null,
    title,
  });

  revalidatePath('/projects');
}

export async function renameItem(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get('id') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  if (!id || !title) {
    revalidatePath('/projects');
    return;
  }

  const supabase = await serverClient();
  await supabase.from('personal_project_items').update({ title }).eq('id', id);

  revalidatePath('/projects');
}

export async function deleteItem(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  // Sub-tasks cascade-delete in the database (ON DELETE CASCADE).
  const supabase = await serverClient();
  await supabase.from('personal_project_items').delete().eq('id', id);

  revalidatePath('/projects');
}

/** Called from the client status control. Plain args, not a form. */
export async function setItemStatus(
  id: string,
  status: Status,
): Promise<void> {
  await requireOwnerAction();
  if (!id || !isStatus(status)) return;

  const supabase = await serverClient();
  await supabase
    .from('personal_project_items')
    .update({ status })
    .eq('id', id);

  revalidatePath('/projects');
}

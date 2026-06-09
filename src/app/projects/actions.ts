'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAllowedUser, isOwner } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';

// Every action re-checks ownership server-side. The middleware already blocks
// non-owners from the route, but server actions can be invoked directly, so we
// never trust the route guard alone.
async function requireOwnerAction() {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!isOwner(u.email)) redirect('/access-denied');
  return u;
}

export async function addTask(formData: FormData): Promise<void> {
  const u = await requireOwnerAction();

  const title = String(formData.get('title') ?? '').trim();
  const project = String(formData.get('project') ?? '').trim();
  const dueRaw = String(formData.get('due_date') ?? '').trim();
  const due_date = dueRaw || null;

  // Silently ignore an empty add rather than erroring — keeps the form simple.
  if (!title) {
    revalidatePath('/projects');
    return;
  }

  const supabase = await serverClient();
  await supabase.from('personal_tasks').insert({
    owner_email: u.email,
    title,
    project,
    due_date,
  });

  revalidatePath('/projects');
}

export async function toggleTask(formData: FormData): Promise<void> {
  await requireOwnerAction();

  const id = String(formData.get('id') ?? '').trim();
  // The checkbox posts "on" when checked, nothing when unchecked. We send the
  // desired next state explicitly so the action doesn't have to read first.
  const done = String(formData.get('done') ?? '') === 'true';
  if (!id) return;

  const supabase = await serverClient();
  await supabase.from('personal_tasks').update({ done }).eq('id', id);

  revalidatePath('/projects');
}

export async function updateTask(formData: FormData): Promise<void> {
  await requireOwnerAction();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const title = String(formData.get('title') ?? '').trim();
  const project = String(formData.get('project') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim() || null;
  const dueRaw = String(formData.get('due_date') ?? '').trim();
  const due_date = dueRaw || null;

  if (!title) {
    revalidatePath('/projects');
    return;
  }

  const supabase = await serverClient();
  await supabase
    .from('personal_tasks')
    .update({ title, project, notes, due_date })
    .eq('id', id);

  revalidatePath('/projects');
}

export async function deleteTask(formData: FormData): Promise<void> {
  await requireOwnerAction();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const supabase = await serverClient();
  await supabase.from('personal_tasks').delete().eq('id', id);

  revalidatePath('/projects');
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canEditMeetings, getAllowedUser } from '@/lib/auth';
import { serverClient } from '@/lib/supabase';
import { buildMeetingSlug } from '@/lib/meeting-data';

async function requireMeetingEditor() {
  const u = await getAllowedUser();
  if (!u) redirect('/login');
  if (!canEditMeetings(u.role)) redirect('/access-denied');
  return u;
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (raw == null) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function refreshHubPages(slug?: string) {
  revalidatePath('/hub/meetings');
  revalidatePath('/hub/library');
  revalidatePath('/hub');
  if (slug) {
    revalidatePath(`/hub/meetings/${slug}`);
    revalidatePath(`/hub/meetings/${slug}/present`);
  }
}

export async function createMeeting(formData: FormData): Promise<void> {
  const u = await requireMeetingEditor();

  const date = String(formData.get('date') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const educationalTitle =
    String(formData.get('educational_title') ?? '').trim() || null;
  const educationalTags = parseTags(formData.get('educational_tags'));
  const educationalBody =
    String(formData.get('educational_body') ?? '').trim() || null;
  const operationalBody =
    String(formData.get('operational_body') ?? '').trim() || null;

  if (!date || !title) {
    redirect(
      `/hub/meetings/new?error=${encodeURIComponent('Date and title are required.')}`,
    );
  }
  if (!educationalBody && !operationalBody) {
    redirect(
      `/hub/meetings/new?error=${encodeURIComponent('Add content to at least one section (Educational or Operational) before saving.')}`,
    );
  }

  const slug = buildMeetingSlug(date, educationalTitle);
  const supabase = await serverClient();
  const { error } = await supabase.from('meetings').insert({
    date,
    title,
    slug,
    educational_title: educationalTitle,
    educational_tags: educationalTags,
    educational_body: educationalBody,
    operational_body: operationalBody,
    created_by: u.email,
  });
  if (error) {
    redirect(`/hub/meetings/new?error=${encodeURIComponent(error.message)}`);
  }

  refreshHubPages(slug);
  redirect(`/hub/meetings/${slug}`);
}

export async function updateMeeting(formData: FormData): Promise<void> {
  await requireMeetingEditor();

  const originalSlug = String(formData.get('original_slug') ?? '').trim();
  if (!originalSlug) {
    redirect('/hub/meetings?error=missing_slug');
  }

  const date = String(formData.get('date') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const educationalTitle =
    String(formData.get('educational_title') ?? '').trim() || null;
  const educationalTags = parseTags(formData.get('educational_tags'));
  const educationalBody =
    String(formData.get('educational_body') ?? '').trim() || null;
  const operationalBody =
    String(formData.get('operational_body') ?? '').trim() || null;

  if (!date || !title) {
    redirect(
      `/hub/meetings/${originalSlug}/edit?error=${encodeURIComponent('Date and title are required.')}`,
    );
  }
  if (!educationalBody && !operationalBody) {
    redirect(
      `/hub/meetings/${originalSlug}/edit?error=${encodeURIComponent('Add content to at least one section before saving.')}`,
    );
  }

  // Regenerate slug from date + topic so renaming the topic updates the URL.
  const newSlug = buildMeetingSlug(date, educationalTitle);

  const supabase = await serverClient();
  const { error } = await supabase
    .from('meetings')
    .update({
      date,
      title,
      slug: newSlug,
      educational_title: educationalTitle,
      educational_tags: educationalTags,
      educational_body: educationalBody,
      operational_body: operationalBody,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', originalSlug);
  if (error) {
    redirect(
      `/hub/meetings/${originalSlug}/edit?error=${encodeURIComponent(error.message)}`,
    );
  }

  refreshHubPages(originalSlug);
  refreshHubPages(newSlug);
  redirect(`/hub/meetings/${newSlug}`);
}

export async function deleteMeeting(formData: FormData): Promise<void> {
  await requireMeetingEditor();
  const slug = String(formData.get('slug') ?? '').trim();
  if (!slug) redirect('/hub/meetings');

  const supabase = await serverClient();
  const { error } = await supabase.from('meetings').delete().eq('slug', slug);
  if (error) {
    redirect(
      `/hub/meetings/${slug}?error=${encodeURIComponent(error.message)}`,
    );
  }
  refreshHubPages(slug);
  redirect('/hub/meetings');
}

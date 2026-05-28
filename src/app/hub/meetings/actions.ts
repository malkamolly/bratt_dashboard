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
  const topicSlug = String(formData.get('topic_slug') ?? '').trim() || null;
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
  // A meeting needs at least one of: topic deck, inline educational, or
  // operational content.
  if (!topicSlug && !educationalBody && !operationalBody) {
    redirect(
      `/hub/meetings/new?error=${encodeURIComponent('Pick a topic deck or add content to the Educational or Operational section before saving.')}`,
    );
  }

  // Slug uses the topic deck title if linked, otherwise the inline title.
  // The meeting's URL shouldn't depend on the deck's data, so we fall back
  // to the deck slug itself when no inline title was given.
  const slugTopic = educationalTitle || topicSlug;
  const slug = buildMeetingSlug(date, slugTopic);
  const supabase = await serverClient();
  const { error } = await supabase.from('meetings').insert({
    date,
    title,
    slug,
    topic_slug: topicSlug,
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
  const topicSlug = String(formData.get('topic_slug') ?? '').trim() || null;
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
  if (!topicSlug && !educationalBody && !operationalBody) {
    redirect(
      `/hub/meetings/${originalSlug}/edit?error=${encodeURIComponent('Pick a topic deck or add content to the Educational or Operational section before saving.')}`,
    );
  }

  // Regenerate slug from date + topic so renaming the topic updates the URL.
  const slugTopic = educationalTitle || topicSlug;
  const newSlug = buildMeetingSlug(date, slugTopic);

  const supabase = await serverClient();
  const { error } = await supabase
    .from('meetings')
    .update({
      date,
      title,
      slug: newSlug,
      topic_slug: topicSlug,
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

/**
 * Upload an image for a meeting slide. Returns the public URL on success or
 * an error message on failure. Called from a client component, not from a
 * form-action submission (because we need the URL back to insert into the
 * textarea).
 */
export async function uploadMeetingImage(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const u = await getAllowedUser();
  if (!u || !canEditMeetings(u.role)) {
    return { error: 'Not authorized to upload images.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { error: 'No file provided.' };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: 'File is larger than 8 MB.' };
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'File must be an image.' };
  }

  const extFromName = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : '';
  const extFromMime = file.type.split('/').pop()!.toLowerCase();
  const ext = extFromName || extFromMime || 'png';
  const safeBase = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeBase ? '-' + safeBase : ''}.${ext}`;

  const supabase = await serverClient();
  const { error: uploadError } = await supabase.storage
    .from('meeting-images')
    .upload(filename, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data } = supabase.storage
    .from('meeting-images')
    .getPublicUrl(filename);

  return { url: data.publicUrl };
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

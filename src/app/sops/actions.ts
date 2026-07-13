'use server';

// ============================================================================
// SOP library — server actions
// ============================================================================
// All writes for the office SOP library:
//   - uploadSop        parse an uploaded Word (.docx) or text (.txt) file into
//                      a new sop_documents row + stash the original file.
//   - saveSopContent   edit a doc's title, category, and content (markdown).
//   - deleteSop        soft-delete a doc (and remove its stored original).
//   - downloadSop      redirect to a short-lived signed URL for the original.
// Every action is gated to office roles (canUseSops); RLS on the table +
// bucket is the backstop.
// ============================================================================

import mammoth from 'mammoth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import { getAllowedUser, canUseSops } from '@/lib/auth';
import {
  htmlToMarkdown,
  markdownToHtml,
  htmlToPlainText,
} from '@/lib/sop-data';

const SOP_BUCKET = 'sop-files';
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

async function requireSopEditor() {
  const u = await getAllowedUser();
  if (!u || !canUseSops(u.role)) {
    throw new Error('Forbidden: office access required.');
  }
  return u;
}

/** Escape text so it can be dropped into HTML safely. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Turn plain text into simple paragraph HTML (blank line = new paragraph). */
function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br />')}</p>`)
    .filter((p) => p !== '<p></p>')
    .join('\n');
}

export async function uploadSop(formData: FormData): Promise<void> {
  const user = await requireSopEditor();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/sops?error=${encodeURIComponent('Choose a file to upload.')}`);
  }
  const f = file as File;
  if (f.size > MAX_BYTES) {
    redirect(`/sops?error=${encodeURIComponent('File is larger than 15 MB.')}`);
  }

  const ext = f.name.includes('.')
    ? f.name.split('.').pop()!.toLowerCase()
    : '';

  // --- Extract text + formatted HTML + editable markdown from the file -----
  let bodyText = '';
  let bodyHtml = '';
  let bodyMarkdown = '';
  const buffer = Buffer.from(await f.arrayBuffer());

  if (ext === 'docx') {
    // mammoth reads the modern Word format and emits a small, safe subset of
    // HTML (headings, lists, bold/italic) — no scripts or styles.
    try {
      const [htmlResult, textResult] = await Promise.all([
        mammoth.convertToHtml({ buffer }),
        mammoth.extractRawText({ buffer }),
      ]);
      bodyHtml = htmlResult.value;
      bodyText = textResult.value;
      bodyMarkdown = htmlToMarkdown(bodyHtml);
    } catch {
      redirect(
        `/sops?error=${encodeURIComponent(
          "Couldn't read that Word file. Make sure it's a .docx (not the older .doc).",
        )}`,
      );
    }
  } else if (ext === 'md') {
    // A markdown file is already in our editable format.
    bodyMarkdown = buffer.toString('utf8');
    bodyHtml = markdownToHtml(bodyMarkdown);
    bodyText = htmlToPlainText(bodyHtml);
  } else if (ext === 'txt') {
    bodyText = buffer.toString('utf8');
    bodyHtml = textToHtml(bodyText);
    bodyMarkdown = bodyText;
  } else {
    redirect(
      `/sops?error=${encodeURIComponent(
        `Unsupported file type ".${ext}". Upload a Word (.docx) or text (.txt) file. For a PDF, save it as Word first.`,
      )}`,
    );
  }

  if (!bodyText.trim()) {
    redirect(
      `/sops?error=${encodeURIComponent(
        'That file appears to be empty or has no readable text.',
      )}`,
    );
  }

  // --- Title: use the provided one, else the filename without extension ----
  const providedTitle = String(formData.get('title') ?? '').trim();
  const title =
    providedTitle || f.name.replace(/\.[^.]+$/, '').trim() || 'Untitled SOP';
  const category = String(formData.get('category') ?? '').trim() || null;

  // --- Store the original file in the private bucket -----------------------
  const safeBase =
    f.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9-]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'sop';
  const storagePath = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeBase}.${ext}`;

  const supabase = await serverClient();
  const { error: uploadError } = await supabase.storage
    .from(SOP_BUCKET)
    .upload(storagePath, f, {
      contentType: f.type || 'application/octet-stream',
      upsert: false,
    });
  // A failed original-file upload isn't fatal — we still keep the extracted
  // text so the doc is usable. Just don't record a path we can't serve.
  const savedPath = uploadError ? null : storagePath;

  const { data: inserted, error: insertError } = await supabase
    .from('sop_documents')
    .insert({
      title,
      category,
      body_text: bodyText,
      body_html: bodyHtml,
      body_markdown: bodyMarkdown,
      source_filename: f.name,
      storage_path: savedPath,
      created_by: user.email,
    })
    .select('id')
    .single();

  if (insertError) {
    redirect(`/sops?error=${encodeURIComponent(insertError.message)}`);
  }

  revalidatePath('/sops');
  redirect(`/sops/${inserted!.id}`);
}

/**
 * Save an in-app edit of a document's title, category, and content. The
 * markdown from the editor is the source of truth; we regenerate the reading
 * HTML and the plain-text (search / AI) body from it.
 */
export async function saveSopContent(formData: FormData): Promise<void> {
  await requireSopEditor();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/sops');

  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? '').trim() || null;
  const markdown = String(formData.get('body_markdown') ?? '');

  if (!title) {
    redirect(
      `/sops/${id}/edit?error=${encodeURIComponent('Title cannot be empty.')}`,
    );
  }

  const bodyHtml = markdownToHtml(markdown);
  const bodyText = htmlToPlainText(bodyHtml);

  const supabase = await serverClient();
  const { error } = await supabase
    .from('sop_documents')
    .update({
      title,
      category,
      body_markdown: markdown,
      body_html: bodyHtml,
      body_text: bodyText,
    })
    .eq('id', id);
  if (error) {
    redirect(`/sops/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/sops');
  revalidatePath(`/sops/${id}`);
  redirect(`/sops/${id}`);
}

export async function deleteSop(formData: FormData): Promise<void> {
  await requireSopEditor();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/sops');

  const supabase = await serverClient();

  // Look up the stored original so we can remove it from the bucket too.
  const { data: row } = await supabase
    .from('sop_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();

  if (row?.storage_path) {
    await supabase.storage.from(SOP_BUCKET).remove([row.storage_path]);
  }

  // Soft-delete: keep the row (hidden) so nothing is truly lost.
  const { error } = await supabase
    .from('sop_documents')
    .update({ is_active: false })
    .eq('id', id);
  if (error) {
    redirect(`/sops/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/sops');
  redirect('/sops');
}

export async function downloadSop(formData: FormData): Promise<void> {
  await requireSopEditor();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/sops');

  const supabase = await serverClient();
  const { data: row } = await supabase
    .from('sop_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();

  if (!row?.storage_path) {
    redirect(
      `/sops/${id}?error=${encodeURIComponent('No original file is stored for this document.')}`,
    );
  }

  const { data, error } = await supabase.storage
    .from(SOP_BUCKET)
    .createSignedUrl(row.storage_path, 60);
  if (error || !data?.signedUrl) {
    redirect(
      `/sops/${id}?error=${encodeURIComponent('Could not generate a download link.')}`,
    );
  }

  redirect(data.signedUrl);
}

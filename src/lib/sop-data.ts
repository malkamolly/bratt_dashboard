// ============================================================================
// SOP / documentation library data
// ============================================================================
// Office SOPs live in the `sop_documents` table in Supabase. An office user
// uploads a Word doc on /sops; a server action (src/app/sops/actions.ts)
// extracts the text and stores it here. This file holds the read helpers used
// by the library pages. Writes (upload / edit / delete) live in the actions
// file so they can carry the 'use server' directive.
//
// The corpus is small (an office's worth of SOPs), so the list view fetches
// everything and filters in the browser — no server-side search needed.
// ============================================================================

import { serverClient } from './supabase';

export type SopDocument = {
  id: string;
  title: string;
  category: string | null;
  body_text: string;
  body_html: string;
  source_filename: string | null;
  storage_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A lighter shape for the list view — omits the heavy body fields. */
export type SopSummary = Omit<SopDocument, 'body_text' | 'body_html'> & {
  /** First ~200 chars of the plain text, for a preview line on the card. */
  excerpt: string;
};

function rowToDocument(row: Record<string, unknown>): SopDocument {
  return {
    id: row.id as string,
    title: (row.title as string) ?? '',
    category: (row.category as string | null) ?? null,
    body_text: (row.body_text as string) ?? '',
    body_html: (row.body_html as string) ?? '',
    source_filename: (row.source_filename as string | null) ?? null,
    storage_path: (row.storage_path as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** All active SOPs, newest first, as lightweight summaries for the list. */
export async function listSops(): Promise<SopSummary[]> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('sop_documents')
    .select(
      'id, title, category, source_filename, storage_path, created_by, created_at, updated_at, body_text',
    )
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const text = ((row.body_text as string) ?? '').replace(/\s+/g, ' ').trim();
    return {
      id: row.id as string,
      title: (row.title as string) ?? '',
      category: (row.category as string | null) ?? null,
      source_filename: (row.source_filename as string | null) ?? null,
      storage_path: (row.storage_path as string | null) ?? null,
      created_by: (row.created_by as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      excerpt: text.slice(0, 200),
    };
  });
}

/** A single SOP with its full body, or null if not found / inactive. */
export async function getSop(id: string): Promise<SopDocument | null> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('sop_documents')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDocument(data) : null;
}

export type TocItem = { id: string; text: string; level: number };

/**
 * Give every top-level heading in the document body a stable `id` and pull out
 * a table of contents. Word docs that were written with real heading styles
 * come through mammoth as <h1>/<h2>/<h3>; this lets the reading view show an
 * "On this page" jump list and lets those links scroll to the right spot.
 * Docs with no headings just get an empty toc and render as a single column.
 */
export function buildToc(html: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Set<string>();

  const out = html.replace(
    /<h([1-3])>([\s\S]*?)<\/h\1>/gi,
    (_match, lvl: string, inner: string) => {
      const level = Number(lvl);
      const text = inner.replace(/<[^>]+>/g, '').trim();
      if (!text) return `<h${lvl}>${inner}</h${lvl}>`;

      const base =
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60) || 'section';
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);

      toc.push({ id, text, level });
      return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
    },
  );

  return { html: out, toc };
}

/** The distinct category names in use, sorted, for the filter chips. */
export function collectCategories(docs: SopSummary[]): string[] {
  const set = new Set<string>();
  for (const d of docs) {
    if (d.category && d.category.trim()) set.add(d.category.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

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
  /** Editable Markdown source. Empty for docs uploaded before in-app editing;
   *  the edit screen backfills it from body_html on first open. */
  body_markdown: string;
  source_filename: string | null;
  storage_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A lighter shape for the list view — omits the heavy body fields. */
export type SopSummary = Omit<
  SopDocument,
  'body_text' | 'body_html' | 'body_markdown'
> & {
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
    body_markdown: (row.body_markdown as string) ?? '',
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

import { parse, type HTMLElement, type Node } from 'node-html-parser';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// ----------------------------------------------------------------------------
// Format conversion (Markdown <-> HTML <-> plain text)
// ----------------------------------------------------------------------------
// The reading view renders body_html; the editor edits body_markdown; search
// and the future ask-the-docs feature use body_text. These keep the three in
// sync. Editors are trusted office/admin users, so we don't sanitize the HTML
// (same trust model as the mammoth-extracted upload HTML we already render).

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.use(gfm); // tables, strikethrough

/** Markdown -> HTML for the reading view. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** HTML -> Markdown, used to seed the editor from an uploaded doc's HTML. */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

/** HTML -> plain text for search / AI. */
export function htmlToPlainText(html: string): string {
  return parse(html).text.replace(/\s+/g, ' ').trim();
}

export type TocItem = { id: string; text: string };
export type SopSection = { id: string; title: string; html: string };
export type SopContent = {
  /** Any content before the first section heading (the doc's lead-in). */
  intro: string;
  /** The document split into titled sections, one card each. */
  sections: SopSection[];
  /** Jump list built from the section titles. */
  toc: TocItem[];
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'section'
  );
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3']);

/**
 * Is this node a "section title"? Either a real heading (from a Word heading
 * style) or a paragraph whose whole content is a single short bold run — which
 * is how a lot of Word docs mark sections instead of using heading styles.
 * Treating both as boundaries means the card layout works either way.
 */
function isSectionBoundary(node: Node): node is HTMLElement {
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (!tag) return false;
  if (HEADING_TAGS.has(tag)) return el.text.trim().length > 0;

  if (tag === 'P') {
    const kids = el.childNodes.filter(
      (n) => !(n.nodeType === 3 && !n.rawText.trim()),
    );
    if (kids.length !== 1) return false;
    const only = kids[0] as HTMLElement;
    if (only.tagName !== 'STRONG' && only.tagName !== 'B') return false;
    const text = el.text.trim();
    return text.length > 0 && text.length <= 80;
  }
  return false;
}

/**
 * Split the extracted document HTML into an intro plus a list of titled
 * sections, so the reading view can render each section as its own card. If
 * the document has no detectable section titles, `sections` is empty and the
 * whole body comes back as `intro` (rendered as a single card).
 */
export function splitDocument(html: string): SopContent {
  const root = parse(html);
  const used = new Set<string>();

  let introHtml = '';
  const sections: SopSection[] = [];
  let current: SopSection | null = null;

  for (const node of root.childNodes) {
    if (isSectionBoundary(node)) {
      const title = node.text.trim();
      let id = slugify(title);
      let n = 2;
      while (used.has(id)) id = `${slugify(title)}-${n++}`;
      used.add(id);
      current = { id, title, html: '' };
      sections.push(current);
    } else if (current) {
      current.html += node.toString();
    } else {
      introHtml += node.toString();
    }
  }

  return {
    intro: introHtml.trim(),
    sections,
    toc: sections.map((s) => ({ id: s.id, text: s.title })),
  };
}

/** The distinct category names in use, sorted, for the filter chips. */
export function collectCategories(docs: SopSummary[]): string[] {
  const set = new Set<string>();
  for (const d of docs) {
    if (d.category && d.category.trim()) set.add(d.category.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

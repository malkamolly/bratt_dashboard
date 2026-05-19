// ============================================================================
// Meeting data + slide parsing
// ============================================================================
// Meetings live in the `meetings` table in Supabase. The sales manager
// creates them through the form at /hub/meetings/new; the markdown bodies
// for the Educational and Operational sections are split into slides on
// every `# ` heading (one `#` heading = one slide) for the presentation
// view at /hub/meetings/<slug>/present.
// ============================================================================

import { serverClient } from './supabase';

export type Meeting = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  slug: string;
  educational_title: string | null;
  educational_tags: string[];
  educational_body: string | null;
  operational_body: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type Slide = {
  /** "educational" or "operational" — useful for the presentation footer */
  section: 'educational' | 'operational';
  /** Heading captured from the `# ` line, may be empty for an untitled lead-in */
  title: string;
  /** Markdown body for the slide (everything between this # and the next) */
  body: string;
};

export async function listMeetings(): Promise<Meeting[]> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToMeeting);
}

export async function getMeetingBySlug(slug: string): Promise<Meeting | null> {
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToMeeting(data) : null;
}

export async function listTags(): Promise<string[]> {
  const meetings = await listMeetings();
  const tagSet = new Set<string>();
  for (const m of meetings) {
    for (const t of m.educational_tags) tagSet.add(t);
  }
  return Array.from(tagSet).sort();
}

export function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, '-');
}

function rowToMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: String(row.id),
    date: String(row.date),
    title: String(row.title),
    slug: String(row.slug),
    educational_title: row.educational_title
      ? String(row.educational_title)
      : null,
    educational_tags: Array.isArray(row.educational_tags)
      ? row.educational_tags.map(String)
      : [],
    educational_body: row.educational_body ? String(row.educational_body) : null,
    operational_body: row.operational_body ? String(row.operational_body) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: row.created_by ? String(row.created_by) : null,
  };
}

/**
 * Split a markdown body into slides. Every line starting with "# " begins a
 * new slide; the heading text is the slide title, everything between that
 * line and the next "# " line is the body. Subheadings (## and deeper)
 * stay inside the slide.
 *
 * If the body has no "# " headings, returns one untitled slide containing
 * the whole body (assuming it has any non-whitespace content).
 */
export function splitIntoSlides(
  body: string | null | undefined,
  section: Slide['section'],
): Slide[] {
  if (!body || !body.trim()) return [];

  const lines = body.split('\n');
  const slides: Slide[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      if (current) {
        slides.push({
          section,
          title: current.title,
          body: current.bodyLines.join('\n').trim(),
        });
      }
      current = { title: match[1].trim(), bodyLines: [] };
    } else {
      if (!current) current = { title: '', bodyLines: [] };
      current.bodyLines.push(line);
    }
  }
  if (current) {
    slides.push({
      section,
      title: current.title,
      body: current.bodyLines.join('\n').trim(),
    });
  }
  return slides.filter((s) => s.title || s.body.trim());
}

export function meetingToSlides(m: Meeting): Slide[] {
  return [
    ...splitIntoSlides(m.educational_body, 'educational'),
    ...splitIntoSlides(m.operational_body, 'operational'),
  ];
}

/** Slug builder used when creating a new meeting from the form */
export function buildMeetingSlug(date: string, topic: string | null): string {
  const datePart = date; // already YYYY-MM-DD
  const topicPart = topic
    ? '-' +
      topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : '-meeting';
  return `${datePart}${topicPart}`;
}

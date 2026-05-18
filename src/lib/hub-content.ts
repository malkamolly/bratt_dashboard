// ============================================================================
// Hub content loader
// ============================================================================
// Reads the markdown files in src/content/{arborists,meetings} at request
// time and parses the YAML frontmatter. Modeled after the Jekyll site this
// replaces, so editing one of those files is still the way to update the hub.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const CONTENT_ROOT = path.join(process.cwd(), 'src', 'content');

export type Arborist = {
  slug: string;
  name: string;
  title: string;
  certified: boolean;
  isa_number?: string | null;
  manager?: boolean;
  photo?: string | null;
  salesperson_name?: string | null;
  body: string;
};

export type Meeting = {
  slug: string;
  date: string; // YYYY-MM-DD
  title: string;
  educational?: {
    title: string;
    tags?: string[];
    body: string;
  };
  housekeeping?: string;
  operations?: string;
};

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

function slugFromFile(file: string): string {
  return file.replace(/\.md$/, '');
}

export function listArborists(): Arborist[] {
  const dir = path.join(CONTENT_ROOT, 'arborists');
  return readDirSafe(dir)
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data, content } = matter(raw);
      return {
        slug: slugFromFile(file),
        name: String(data.name ?? ''),
        title: String(data.title ?? ''),
        certified: Boolean(data.certified),
        isa_number: data.isa_number ? String(data.isa_number) : null,
        manager: Boolean(data.manager),
        photo: data.photo ? String(data.photo) : null,
        salesperson_name: data.salesperson_name
          ? String(data.salesperson_name)
          : null,
        body: content,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getArborist(slug: string): Arborist | null {
  const file = path.join(CONTENT_ROOT, 'arborists', `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  return {
    slug,
    name: String(data.name ?? ''),
    title: String(data.title ?? ''),
    certified: Boolean(data.certified),
    isa_number: data.isa_number ? String(data.isa_number) : null,
    manager: Boolean(data.manager),
    photo: data.photo ? String(data.photo) : null,
    salesperson_name: data.salesperson_name
      ? String(data.salesperson_name)
      : null,
    body: content,
  };
}

export function listMeetings(): Meeting[] {
  const dir = path.join(CONTENT_ROOT, 'meetings');
  return readDirSafe(dir)
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const { data } = matter(raw);
      return {
        slug: slugFromFile(file),
        date: String(data.date ?? ''),
        title: String(data.title ?? ''),
        educational: data.educational
          ? {
              title: String(data.educational.title ?? ''),
              tags: Array.isArray(data.educational.tags)
                ? data.educational.tags.map(String)
                : [],
              body: String(data.educational.body ?? ''),
            }
          : undefined,
        housekeeping: data.housekeeping ? String(data.housekeeping) : undefined,
        operations: data.operations ? String(data.operations) : undefined,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getMeeting(slug: string): Meeting | null {
  const file = path.join(CONTENT_ROOT, 'meetings', `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const { data } = matter(raw);
  return {
    slug,
    date: String(data.date ?? ''),
    title: String(data.title ?? ''),
    educational: data.educational
      ? {
          title: String(data.educational.title ?? ''),
          tags: Array.isArray(data.educational.tags)
            ? data.educational.tags.map(String)
            : [],
          body: String(data.educational.body ?? ''),
        }
      : undefined,
    housekeeping: data.housekeeping ? String(data.housekeeping) : undefined,
    operations: data.operations ? String(data.operations) : undefined,
  };
}

export function listTags(): string[] {
  const tagSet = new Set<string>();
  for (const m of listMeetings()) {
    for (const t of m.educational?.tags ?? []) tagSet.add(t);
  }
  return Array.from(tagSet).sort();
}

export function tagSlug(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, '-');
}

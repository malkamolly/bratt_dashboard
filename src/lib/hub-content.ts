// ============================================================================
// Hub arborist content loader
// ============================================================================
// Reads the markdown files in src/content/arborists/ at request time and
// parses the YAML frontmatter. The arborist roster lives in git (rare edits,
// usually just a hire or a certification change). Meetings used to live here
// too but are now stored in Supabase — see lib/meeting-data.ts.
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
  // Arborists pinned to the end of the roster (Sales Manager + senior).
  // Otherwise alphabetical by name.
  const PINNED_LAST = ['brent-b', 'caleb-o'];

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
    .sort((a, b) => {
      const aPinned = PINNED_LAST.indexOf(a.slug);
      const bPinned = PINNED_LAST.indexOf(b.slug);
      if (aPinned !== -1 && bPinned === -1) return 1;
      if (bPinned !== -1 && aPinned === -1) return -1;
      if (aPinned !== -1 && bPinned !== -1) return aPinned - bPinned;
      return a.name.localeCompare(b.name);
    });
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

export function getArboristBySalespersonName(
  salespersonName: string,
): Arborist | null {
  const target = salespersonName.toLowerCase();
  return (
    listArborists().find(
      (a) => (a.salesperson_name ?? '').toLowerCase() === target,
    ) ?? null
  );
}

// ============================================================================
// Training-deck helpers
// ============================================================================
// Slide content for each training module is authored in plain text files at
// /content/training-modules/<slug>.txt. The renderer in
// /public/training-deck/ parses the text into 23 named layouts at runtime.
//
// We expose:
//   - loadSourceText(slug): read the module's .txt file from disk
//   - countSlides(): count @layout blocks
//   - moduleMetaFor(): build the meta object the renderer wants
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TrainingModule } from './crew-data';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'training-modules');

/**
 * Reads a module's source text from /content/training-modules/<slug>.txt.
 * Returns null if the file is missing or unreadable. Slugs are checked
 * against a safe character set so a malicious caller can't traverse the
 * filesystem.
 */
export async function loadSourceText(slug: string): Promise<string | null> {
  if (!/^[a-z0-9_-]+$/i.test(slug)) return null;
  try {
    const filePath = path.join(CONTENT_ROOT, `${slug}.txt`);
    const text = await readFile(filePath, 'utf8');
    return text;
  } catch {
    return null;
  }
}

/**
 * Counts how many `@layout` blocks appear in a module's source text.
 * Lines that start with `#` or `//` are comments; lines that start with
 * `@@` (e.g. `@@appendix`) are renderer hints, not slides.
 */
export function countSlides(source: string | null | undefined): number {
  if (!source) return 0;
  let n = 0;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith('@') && !line.startsWith('@@')) n++;
  }
  return n;
}

export type ModuleMeta = {
  moduleTitle: string;
  brandFooter: string;
  footerLeft: string;
  version: string;
  theme: string;
};

export function moduleMetaFor(mod: TrainingModule & { theme?: string }): ModuleMeta {
  const upperName = mod.name.toUpperCase();
  return {
    moduleTitle: mod.name,
    brandFooter: 'Bratt Tree · Training Series',
    footerLeft: `BRATT TREE  |  ${upperName}`,
    version: `Version ${mod.version}`,
    theme: (mod.theme as string | undefined) ?? 'bark-cream',
  };
}

export const VALID_THEMES = ['bark-cream', 'bark-heavy', 'field-manual'] as const;
export type Theme = (typeof VALID_THEMES)[number];

export function isValidTheme(t: string): t is Theme {
  return (VALID_THEMES as readonly string[]).includes(t);
}

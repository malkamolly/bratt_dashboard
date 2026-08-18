// ============================================================================
// Brand image bytes for server-side rendering (SERVER ONLY)
// ============================================================================
// The work order PDF needs the actual logo files. Reading them from /public with
// fs is the only option — a Vercel function has no browser to fetch them with,
// and the CDN copy isn't on the function's filesystem unless we ask for it.
//
// That "ask" is next.config.js -> outputFileTracingIncludes, which copies these
// files into the deployed function bundle. If that ever gets dropped, every
// loader here returns null and the PDF falls back to drawing text instead of
// images — a plain-looking work order, never a failed one.
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PARTNER } from './partner-config';

/** Read once per warm function, not once per PDF. */
const cache = new Map<string, Uint8Array | null>();

async function loadPublicFile(relative: string): Promise<Uint8Array | null> {
  if (cache.has(relative)) return cache.get(relative) ?? null;

  let bytes: Uint8Array | null = null;
  try {
    const full = path.join(process.cwd(), 'public', relative.replace(/^\//, ''));
    bytes = new Uint8Array(await readFile(full));
  } catch {
    // Missing file is not an error worth failing a work order over.
    bytes = null;
  }
  cache.set(relative, bytes);
  return bytes;
}

/** The Bratt badge logo (the full lockup with its lime keyline). */
export function loadBrattLogo(): Promise<Uint8Array | null> {
  return loadPublicFile('brand/logotype.png');
}

/**
 * The partner's logo. Tries the same candidate filenames the web header does, so
 * whichever name their file was uploaded under works here too.
 */
export async function loadPartnerLogo(): Promise<Uint8Array | null> {
  for (const candidate of PARTNER.logoCandidates) {
    const bytes = await loadPublicFile(candidate.replace(/^\//, ''));
    if (bytes) return bytes;
  }
  return null;
}

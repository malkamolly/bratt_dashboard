// ============================================================================
// Onboarding-deck helpers
// ============================================================================
// Slide content for each onboarding deck is authored in plain text files at
// /content/onboarding/<slug>.txt, using the same `@layout` syntax as the
// training-module decks. The renderer in /public/training-deck/ parses the
// text into layouts at runtime.
//
// Onboarding decks don't live in the DB the way training modules do — they're
// just static content, with a hand-written meta block for the deck title and
// footer.
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModuleMeta } from './training-deck';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'onboarding');

export type OnboardingDeck = {
  slug: string;
  title: string;
  description: string;
  /** Used as the footer left-side text inside the deck */
  footerLeft: string;
  /** Used as the cover meta-right (and the corner of every slide) */
  version: string;
};

// Registry of available onboarding decks. Add new ones here as we build them
// (e.g. office onboarding, manager onboarding). Each entry must have a
// corresponding /content/onboarding/<slug>.txt file.
export const ONBOARDING_DECKS: Record<string, OnboardingDeck> = {
  field: {
    slug: 'field',
    title: 'Field Crew Onboarding',
    description:
      'Your first days, the tools you’ll use, and how we work in the field.',
    footerLeft: 'BRATT TREE  |  FIELD CREW ONBOARDING',
    version: 'Version 1.0',
  },
};

export function getOnboardingDeck(slug: string): OnboardingDeck | null {
  return ONBOARDING_DECKS[slug] ?? null;
}

/**
 * Reads an onboarding deck's source text from /content/onboarding/<slug>.txt.
 * Returns null if the file is missing. Slugs are checked against a safe
 * character set so a malicious caller can't traverse the filesystem.
 */
export async function loadOnboardingSource(
  slug: string,
): Promise<string | null> {
  if (!/^[a-z0-9_-]+$/i.test(slug)) return null;
  try {
    const filePath = path.join(CONTENT_ROOT, `${slug}.txt`);
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function onboardingDeckMeta(deck: OnboardingDeck): ModuleMeta {
  return {
    moduleTitle: deck.title,
    brandFooter: 'Bratt Tree · Onboarding',
    footerLeft: deck.footerLeft,
    version: deck.version,
    theme: 'bark-cream',
  };
}

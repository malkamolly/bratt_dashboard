// ============================================================================
// Topic-deck helpers
// ============================================================================
// "Topic decks" are educational slide decks that live in the Sales Arborist
// Hub library. They mirror the onboarding-deck pattern: each deck's source
// is plain text at /content/topics/<slug>.txt using the same `@layout`
// syntax as training modules, and the registry below holds the title,
// description, tags, and date.
//
// A topic deck is independent of any specific weekly meeting. To present
// one at a meeting, link the meeting → deck from the New Meeting form
// (the meeting carries the topic_slug, not the other way around). The
// library page joins on that to show a "Presented at..." cross-link on
// each deck card.
// ============================================================================

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ModuleMeta } from './training-deck';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'topics');

export type TopicDeck = {
  slug: string;
  title: string;
  description: string;
  /** Tags shown on the library card and used by the tag filter */
  tags: string[];
  /** Date the deck was added/published — used for sort order in the library */
  date: string; // YYYY-MM-DD
  /** Used as the footer left-side text inside the deck */
  footerLeft: string;
  /** Used as the cover meta-right (and the corner of every slide) */
  version: string;
};

// Registry of available topic decks. Add new ones here as we build them.
// Each entry must have a corresponding /content/topics/<slug>.txt file.
// The `date` field is the date the topic was originally taught (or
// added) — used to sort the library chronologically.
export const TOPIC_DECKS: Record<string, TopicDeck> = {
  'verticillium-wilt': {
    slug: 'verticillium-wilt',
    title: 'Verticillium Wilt',
    description:
      'A soil-borne fungus that kills susceptible trees. What to look for and how to talk to clients about it.',
    tags: ['Disease', 'Plant Health Care'],
    date: '2026-05-28',
    footerLeft: 'BRATT TREE  |  VERTICILLIUM WILT',
    version: 'Version 1.0',
  },
  'cabling-and-bracing': {
    slug: 'cabling-and-bracing',
    title: 'Cabling & Bracing',
    description:
      'What to do about structurally compromised trees — and how to sell the alternative to removal.',
    tags: ['Structural Care', 'Sales'],
    date: '2024-09-22',
    footerLeft: 'BRATT TREE  |  CABLING & BRACING',
    version: 'Version 1.0',
  },
  'deciduous-leaf-diseases': {
    slug: 'deciduous-leaf-diseases',
    title: 'Deciduous Leaf Diseases',
    description:
      'Apple Scab, Anthracnose, Fireblight, and Bur Oak Blight. How to tell the look-alikes from the killer.',
    tags: ['Disease', 'Plant Health Care'],
    date: '2024-06-17',
    footerLeft: 'BRATT TREE  |  DECIDUOUS LEAF DISEASES',
    version: 'Version 1.0',
  },
  'common-conifer-pests-and-diseases': {
    slug: 'common-conifer-pests-and-diseases',
    title: 'Conifer Pests & Diseases',
    description:
      'Rhizosphaera, Diplodia, Dothistroma, Brown Spot Needle Blight, and European Pine Sawfly. Lethal if untreated — and easy to spot.',
    tags: ['Disease', 'Pest', 'Plant Health Care'],
    date: '2025-06-01',
    footerLeft: 'BRATT TREE  |  CONIFER PESTS & DISEASES',
    version: 'Version 1.1',
  },
  'oak-galls': {
    slug: 'oak-galls',
    title: 'Oak Galls',
    description:
      'Red Oak Apple Gall, Jumping Oak Gall, Bullet Gall — three weird-looking but harmless cynipid-wasp galls on Minnesota oaks.',
    tags: ['Pest', 'Plant Health Care'],
    date: '2024-12-16',
    footerLeft: 'BRATT TREE  |  OAK GALLS',
    version: 'Version 1.0',
  },
  'hemlock-rust-mite-and-ded': {
    slug: 'hemlock-rust-mite-and-ded',
    title: 'Hemlock Rust Mite & Dutch Elm Disease',
    description:
      'Two issues from one meeting — and the diagnostic discipline they both demand.',
    tags: ['Pest', 'Disease', 'Plant Health Care'],
    date: '2024-08-26',
    footerLeft: 'BRATT TREE  |  HRM & DED',
    version: 'Version 1.0',
  },
  'native-oaks-of-minnesota': {
    slug: 'native-oaks-of-minnesota',
    title: 'Native Oaks of Minnesota',
    description:
      'Red Oak, Pin Oak, White Oak, Bur Oak, Swamp White Oak. Look at the leaf, look at the acorn, know the family.',
    tags: ['Tree ID'],
    date: '2024-09-30',
    footerLeft: 'BRATT TREE  |  NATIVE OAKS',
    version: 'Version 1.0',
  },
  'soil-change-diagnostics': {
    slug: 'soil-change-diagnostics',
    title: 'Soil-Change Diagnostics',
    description:
      'Construction, drainage, landscaping. The four ways human activity quietly kills trees — and how to diagnose them.',
    tags: ['Diagnostics', 'Sales'],
    date: '2025-07-21',
    footerLeft: 'BRATT TREE  |  SOIL-CHANGE DIAGNOSTICS',
    version: 'Version 1.0',
  },
  'elm-foliar-issues': {
    slug: 'elm-foliar-issues',
    title: 'Elm Foliar Issues',
    description:
      'Elm Leaf Beetle, Elm Leaf Miner, and Anthracnose. Three look-alikes — and the conversation that keeps clients from panicking about DED.',
    tags: ['Pest', 'Disease', 'Plant Health Care'],
    date: '2024-07-15',
    footerLeft: 'BRATT TREE  |  ELM FOLIAR ISSUES',
    version: 'Version 1.0',
  },
  'lilac-foliar-diseases': {
    slug: 'lilac-foliar-diseases',
    title: 'Lilac Diseases',
    description:
      'Pseudomonas vs Pseudocercospora — plus iron chlorosis treatment. Two diseases that look identical and one nutrient issue.',
    tags: ['Disease', 'Plant Health Care'],
    date: '2024-07-29',
    footerLeft: 'BRATT TREE  |  LILAC DISEASES',
    version: 'Version 1.0',
  },
  'poplar-canker-diseases': {
    slug: 'poplar-canker-diseases',
    title: 'Poplar Cankers',
    description:
      'Hypoxylon and Septoria. The two fungal diseases that kill more poplars in the Midwest than anything else.',
    tags: ['Disease', 'Plant Health Care'],
    date: '2025-05-19',
    footerLeft: 'BRATT TREE  |  POPLAR CANKERS',
    version: 'Version 1.0',
  },
  'pruning-apple-trees': {
    slug: 'pruning-apple-trees',
    title: 'Pruning Apple Trees',
    description:
      'What an arborist (not an orchardist) needs to know about pruning a residential apple tree for fruit and structure.',
    tags: ['Pruning'],
    date: '2025-02-10',
    footerLeft: 'BRATT TREE  |  APPLE PRUNING',
    version: 'Version 1.0',
  },
  'paclobutrazol-growsmart': {
    slug: 'paclobutrazol-growsmart',
    title: 'GrowSmart (Paclobutrazol)',
    description:
      'Slows top growth, boosts root density, makes the leaves greener. A cheaper alternative to full soil amendment.',
    tags: ['Plant Health Care', 'Sales'],
    date: '2025-05-12',
    footerLeft: 'BRATT TREE  |  GROWSMART',
    version: 'Version 1.0',
  },
  'nutriroot-vs-arborplex': {
    slug: 'nutriroot-vs-arborplex',
    title: 'NutriRoot vs ArborPlex',
    description:
      'A decision framework — when to use which product, and when to use both. Diagnose first, then prescribe.',
    tags: ['Plant Health Care', 'Sales'],
    date: '2025-06-23',
    footerLeft: 'BRATT TREE  |  NUTRIROOT VS ARBORPLEX',
    version: 'Version 1.0',
  },
  'fall-phc-controls': {
    slug: 'fall-phc-controls',
    title: 'Fall Diagnostics',
    description:
      'PHC controls, conifer vs deciduous. What changes after leaf drop — and why fall watering is the single best habit to teach a homeowner.',
    tags: ['Diagnostics', 'Plant Health Care'],
    date: '2024-11-04',
    footerLeft: 'BRATT TREE  |  FALL DIAGNOSTICS',
    version: 'Version 1.0',
  },
};

export function getTopicDeck(slug: string): TopicDeck | null {
  return TOPIC_DECKS[slug] ?? null;
}

export function listTopicDecks(): TopicDeck[] {
  return Object.values(TOPIC_DECKS);
}

/**
 * Reads a topic deck's source text from /content/topics/<slug>.txt.
 * Returns null if the file is missing. Slugs are checked against a safe
 * character set so a malicious caller can't traverse the filesystem.
 */
export async function loadTopicSource(slug: string): Promise<string | null> {
  if (!/^[a-z0-9_-]+$/i.test(slug)) return null;
  try {
    const filePath = path.join(CONTENT_ROOT, `${slug}.txt`);
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function topicDeckMeta(deck: TopicDeck): ModuleMeta {
  return {
    moduleTitle: deck.title,
    brandFooter: 'Bratt Tree · Library',
    footerLeft: deck.footerLeft,
    version: deck.version,
    theme: 'bark-cream',
  };
}

// ============================================================================
// Revenue Calendar — the URL, in one place
// ============================================================================
// Shared by the server page and the client-side month browser, so the two build
// exactly the same links. It was living inside page.tsx; MonthBrowser needs it
// too, and a second copy of "how this page's URL is shaped" is the kind of
// thing that drifts silently.
//
// Pure — no React, no server-only imports — so either side can use it.
// ============================================================================

import type { BusinessUnit, SortKey, SortDir } from '@/lib/scheduled-revenue';

/**
 * Which of the side lists is expanded, if any.
 *
 * Two of these names are ServiceTitan's ('hold', 'parked') because that's what
 * the data says; the page calls them "Waiting on approval" and "Unscheduled".
 * 'pastdated' and 'multiday' are ours.
 */
export type OpenList = 'hold' | 'parked' | 'pastdated' | 'multiday';

export function isOpenList(v: unknown): v is OpenList {
  return (
    v === 'hold' || v === 'parked' || v === 'pastdated' || v === 'multiday'
  );
}

/** Everything the page needs to rebuild its own URL. */
export type Nav = {
  list: OpenList | null;
  year: number;
  month: number;
  unit: BusinessUnit | null;
  day: string | null;
  /** null means "whatever this list sorts by out of the box". */
  sort: SortKey | null;
  dir: SortDir | null;
};

export const BASE_PATH = '/production/revenue-calendar';

/**
 * Every internal link rebuilds the WHOLE query, so changing month doesn't
 * quietly drop the unit filter and switching lists doesn't drop the month.
 */
export function linkTo(nav: Nav, over: Partial<Nav>): string {
  const n = { ...nav, ...over };
  const q = new URLSearchParams();
  if (n.list) q.set('list', n.list);
  q.set('year', String(n.year));
  q.set('month', String(n.month));
  if (n.unit) q.set('unit', n.unit);
  if (n.day) q.set('day', n.day);
  if (n.sort) {
    q.set('sort', n.sort);
    if (n.dir) q.set('dir', n.dir);
  }
  return `${BASE_PATH}?${q.toString()}`;
}

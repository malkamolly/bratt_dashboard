// ============================================================================
// Display formatters
// ============================================================================

import { BUSINESS_TZ } from './dates';

// Pinned to the business timezone rather than the viewer's. Two reasons: a
// timestamp then means the same thing to everyone on the team wherever they're
// standing, and server and client render identical text — formatting in local
// time inside a client component hydrates with a mismatch.
const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pctWhole = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** A timestamp as "Aug 10, 2026, 3:42 PM" in the business timezone. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateTime.format(d);
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return usdWhole.format(n);
}

export function fmtUsdCents(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return usdCents.format(n);
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return pctWhole.format(n);
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(year: number, month: number): string {
  return `${monthNames[month - 1]} ${year}`;
}

/**
 * Turn a work email into a display name, First name + Last initial — the house
 * naming rule (see CLAUDE.md); we never render a full last name. Our addresses
 * are usually just a first name ("connor@" → "Connor"), but a dotted or
 * hyphenated address contributes an initial ("sean.b@" → "Sean B"). Anything
 * unparseable falls back to the address itself so a row is never unattributed.
 */
export function personFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0]?.trim();
  if (!local) return 'Unknown';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const parts = local.split(/[._]+/).filter(Boolean);
  if (parts.length === 0) return email ?? 'Unknown';
  // A hyphenated first name stays whole ("sean-paul" → "Sean-Paul").
  const first = parts[0].split('-').filter(Boolean).map(cap).join('-');
  return parts.length > 1 ? `${first} ${parts[1].charAt(0).toUpperCase()}` : first;
}

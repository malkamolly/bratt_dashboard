// ============================================================================
// Display formatters
// ============================================================================

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

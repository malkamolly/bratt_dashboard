// ============================================================================
// Partner hub auth — a single shared password, deliberately separate from ours
// ============================================================================
// The Partner Hub (/partner/*) is for an outside landscaping company's sales
// team. It does NOT use Supabase auth, the `allowed_emails` allowlist, or any
// role from lib/auth.ts. That separation is the whole point: a partner session
// is just a signed cookie, so there is no code path where a partner user can
// end up holding an internal session or a role that widens later.
//
// Security model, stated plainly: one shared password for the partner's whole
// team, set in the PARTNER_PASSWORD env var. That is appropriate for a pricing
// calculator (no customer data, no writes, nothing to steal but a price list we
// hand them anyway). If we ever put real data behind this, upgrade to per-person
// logins first.
// ============================================================================

/** Cookie holding proof-of-password. Scoped to /partner so it is never sent
 *  to an internal route. */
export const PARTNER_COOKIE = 'bt_partner';

/** How long a partner stays signed in (30 days) — they use this in the field. */
export const PARTNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The value we store in the cookie: a hash of the password plus a fixed salt.
 *
 * Why a hash and not the password itself: if the cookie ever leaks (browser
 * history, a screenshot, a support ticket) it doesn't hand over the password
 * itself. And because it's derived from a secret, nobody can forge it without
 * knowing that secret.
 *
 * Returns null when PARTNER_PASSWORD isn't configured — callers must treat that
 * as "nobody gets in" rather than "everybody gets in".
 */
export async function partnerSessionToken(): Promise<string | null> {
  const password = process.env.PARTNER_PASSWORD;
  if (!password) return null;
  return sha256Hex(`bratt-phc-partner:v1:${password}`);
}

/** Constant-time-ish string compare, so a wrong guess can't be narrowed down
 *  by how long the check took. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Did the visitor type the right shared password? */
export function partnerPasswordMatches(submitted: string): boolean {
  const password = process.env.PARTNER_PASSWORD;
  if (!password) return false;
  return safeEqual(submitted, password);
}

/** Is this cookie value a valid partner session? Safe to call from middleware
 *  (uses Web Crypto, which the edge runtime provides). */
export async function isValidPartnerCookie(
  value: string | undefined | null,
): Promise<boolean> {
  if (!value) return false;
  const expected = await partnerSessionToken();
  if (!expected) return false;
  return safeEqual(value, expected);
}

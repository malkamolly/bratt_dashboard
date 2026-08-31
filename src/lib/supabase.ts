// ============================================================================
// Supabase client factories
// ============================================================================
// One client is exported for normal use:
//   - serverClient(): for code that runs on the Vercel server (route handlers,
//                     server components, server actions). Uses cookies for the
//                     session.
//
// There is deliberately NO browser client. Every sign-in path in this app runs
// server-side (login/actions.ts, easy-login/actions.ts, auth/callback), so the
// browser's JavaScript never needs to read the session. That lets us mark the
// session cookies httpOnly - see AUTH_COOKIE_OPTIONS below, which is the whole
// reason mobile logins survive more than a day.
// ============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Cookie options forced onto every Supabase auth cookie we set.
 *
 * `httpOnly: true` is the important one, and it is NOT the library default
 * (@supabase/ssr ships `httpOnly: false` so its browser client can read the
 * session from JavaScript). We don't use a browser client, so we can lock the
 * cookies down - and locking them down is what fixes the "I have to log in
 * again every morning on my phone" bug:
 *
 * Safari's Intelligent Tracking Prevention caps *script-readable* cookies at
 * 24 hours when you arrive at a site via a cross-site link carrying query
 * parameters. Our magic-link flow is exactly that shape - tap a link in the
 * Gmail app, land on /auth/callback?token_hash=...&type=... - so Safari was
 * expiring a 400-day session cookie overnight. httpOnly cookies are exempt
 * from that cap, because JavaScript can't touch them in the first place.
 *
 * Keep this in sync with the identical block in src/middleware.ts, which
 * refreshes the same cookies on every request.
 */
export const AUTH_COOKIE_OPTIONS = { httpOnly: true } as const;

export async function serverClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS }),
            );
          } catch {
            // setAll can fail in server components; ignore - middleware
            // refreshes the session for us.
          }
        },
      },
    },
  );
}

/**
 * Admin (service-role) client — SERVER ONLY, NEVER import into browser code.
 *
 * The service-role key bypasses Row Level Security and unlocks the auth admin
 * API (creating users, setting passwords). Two uses, and every caller must gate
 * itself FIRST:
 *
 *   1. Letting an admin set/reset another person's password from /admin/access
 *      — gate with requireAdmin().
 *   2. All Plant Health Program data access (src/lib/partner-data.ts) — gate
 *      with requirePartner(). Partner users hold a shared-password cookie, not
 *      a Supabase session, so RLS cannot identify them and their tables grant
 *      nothing to the anon key. See migration 071 for the full reasoning.
 *
 * Throws a clear error if the key isn't configured, so the calling action can
 * show a helpful "add this env var" message instead of a cryptic crash.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================================
// Supabase client factories
// ============================================================================
// Two clients are exported:
//   - browserClient(): for code that runs in the user's browser
//   - serverClient():  for code that runs on the Vercel server (route handlers,
//                      server components). Uses cookies for the session.
// ============================================================================

import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

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
              cookieStore.set(name, value, options),
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

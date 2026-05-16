// ============================================================================
// Supabase client factories
// ============================================================================
// Two clients are exported:
//   - browserClient(): for code that runs in the user's browser
//   - serverClient():  for code that runs on the Vercel server (route handlers,
//                      server components). Uses cookies for the session.
// ============================================================================

import { createBrowserClient, createServerClient } from '@supabase/ssr';
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
        setAll(toSet) {
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

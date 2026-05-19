// ============================================================================
// Edge middleware - runs on every incoming request
// ============================================================================
// Responsibilities:
//   1. Refresh the Supabase session cookie (so it doesn't expire mid-use).
//   2. Bounce un-authenticated requests to /login (except public paths).
//   3. Bounce signed-in users whose email is NOT on the allowlist to a
//      branded "access denied" page, and sign them out.
//   4. Gate hub paths (/pace/*, /sales/*, /production/*, /admin/*, /hub/*,
//      /crew/*) by role. The hub-access matrix is duplicated here from
//      lib/auth.ts because middleware runs at the edge and the import would
//      pull in too much.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/auth/signout',
  '/access-denied',
];

function isPublic(pathname: string) {
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/brand')) return true;
  if (pathname.startsWith('/fonts')) return true;
  if (pathname === '/favicon.ico') return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          toSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refresh session - this is the side effect we want.
  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  if (isPublic(path)) return res;

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Check allowlist + grab the role for hub-level access checks
  const { data: allowed } = await supabase
    .from('allowed_emails')
    .select('email, role')
    .ilike('email', user.email ?? '')
    .maybeSingle();

  if (!allowed) {
    await supabase.auth.signOut();
    const url = req.nextUrl.clone();
    url.pathname = '/access-denied';
    return NextResponse.redirect(url);
  }

  // Hub-level access. The landing page (/) is open to any signed-in
  // allowlist user — it shows only the hub cards they can access.
  const role = allowed.role as
    | 'admin'
    | 'user'
    | 'sales_manager'
    | 'sales_arborist'
    | 'field_crew';

  const HUB_BY_PREFIX: { prefix: string; hub: 'pace' | 'hub' | 'crew' }[] = [
    { prefix: '/pace', hub: 'pace' },
    { prefix: '/sales', hub: 'pace' },
    { prefix: '/production', hub: 'pace' },
    { prefix: '/admin', hub: 'pace' },
    { prefix: '/hub', hub: 'hub' },
    { prefix: '/crew', hub: 'crew' },
  ];

  const HUB_ACCESS = {
    pace: ['admin', 'user', 'sales_manager'] as const,
    hub: ['admin', 'user', 'sales_manager', 'sales_arborist'] as const,
    crew: ['admin', 'user', 'field_crew'] as const,
  };

  const match = HUB_BY_PREFIX.find(
    ({ prefix }) => path === prefix || path.startsWith(prefix + '/'),
  );

  if (match && !(HUB_ACCESS[match.hub] as readonly string[]).includes(role)) {
    const url = req.nextUrl.clone();
    url.pathname = '/access-denied';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Match everything except Next.js internals and static asset folders.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand|fonts).*)'],
};

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
//   5. Gate the external Partner Hub (/partner/*) with its own shared password,
//      handled FIRST and returned early so partner traffic never touches our
//      Supabase session, allowlist, or roles at all. See lib/partner-auth.ts.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isTagsUser } from '@/lib/tags-config';
import { PARTNER_COOKIE, isValidPartnerCookie } from '@/lib/partner-auth';

// Forced onto every Supabase auth cookie we set. Duplicated from
// lib/supabase.ts (rather than imported) for the same reason the hub-access
// matrix below is: that module pulls in next/headers and the service-role
// client, which must not enter the edge runtime. Keep the two in sync.
//
// httpOnly is not the @supabase/ssr default; we can set it because no browser
// code reads the session. It stops Safari from wiping the session after 24
// hours following a magic-link arrival. See lib/supabase.ts for the full note.
const AUTH_COOKIE_OPTIONS = { httpOnly: true } as const;

const PUBLIC_PATHS = [
  '/login',
  '/easy-login',
  '/auth/callback',
  '/auth/signout',
  '/access-denied',
];

function isPublic(pathname: string) {
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/brand')) return true;
  if (pathname.startsWith('/fonts')) return true;
  // /assets holds the Rugfish display font and the logotype. It was missing
  // here (and from the matcher below), so middleware redirected both to /login:
  // the brand font silently never loaded anywhere in the app, and the logo on
  // the public login page 307'd. Static brand files, safe to serve to anyone.
  if (pathname.startsWith('/assets')) return true;
  if (pathname === '/favicon.ico') return true;
  // The daily-report cron runs with no user session; it authenticates itself
  // with CRON_SECRET inside the route, so it must skip the session gate here.
  if (pathname.startsWith('/api/tags/daily-report')) return true;
  // Token-authed collections import/summary. No session is involved, so the
  // middleware must not redirect these to /login — the bearer-token check in
  // the route handlers is the entire gate. See lib/receivables-api.ts.
  if (pathname.startsWith('/api/receivables/')) return true;
  // Same deal for the scheduled-revenue import/summary that runs through the
  // token only, no session, so middleware must not redirect it to /login.
  // See lib/scheduled-revenue-api.ts.
  if (pathname.startsWith('/api/scheduled-revenue/')) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * The external Partner Hub. Completely separate from our internal auth: the only
 * key is the shared password cookie, and this branch returns early so no
 * Supabase session is created or read for partner traffic.
 *
 * It also stamps `x-bt-area: partner` on the request so the root layout knows to
 * hide the internal Bratt header + trust ribbon for this area.
 */
async function partnerGate(req: NextRequest, path: string) {
  const headers = new Headers(req.headers);
  headers.set('x-bt-area', 'partner');
  const res = NextResponse.next({ request: { headers } });

  // The sign-in screen and the endpoint its form posts to have to be reachable
  // without a session.
  if (path === '/partner/login' || path === '/partner/session') return res;

  // API endpoints under /partner check the cookie themselves and answer with a
  // status code. They must NOT be redirected: a 307 on a fetch() is followed
  // automatically, so an expired session would hand the browser the login page
  // with status 200 — and a photo upload would look like it succeeded while
  // storing nothing. Let them through; the handlers return 401.
  if (path === '/partner/photos' || path === '/partner/map') return res;

  const ok = await isValidPartnerCookie(req.cookies.get(PARTNER_COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/partner/login';
    url.search = '';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return res;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path === '/partner' || path.startsWith('/partner/')) {
    return partnerGate(req, path);
  }

  // Everything below is the INTERNAL app. Strip any spoofed area header so a
  // visitor can't hide our own chrome by sending it themselves.
  const internalHeaders = new Headers(req.headers);
  internalHeaders.delete('x-bt-area');
  const res = NextResponse.next({ request: { headers: internalHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          toSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            // AUTH_COOKIE_OPTIONS forces httpOnly. Without it Safari treats the
            // session as script-writable storage and wipes it after 24 hours
            // when the user arrived via a magic link, which is why phones were
            // asking for a new login every morning. See lib/supabase.ts.
            res.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
          });
        },
      },
    },
  );

  // Refresh session - this is the side effect we want.
  const { data: { user } } = await supabase.auth.getUser();

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

  // The private "My Projects" hub is EMAIL-gated to the single owner (even other
  // admins can't enter). Keep this in sync with OWNER_EMAIL in lib/auth.ts and
  // the RLS policy in migration 047.
  if (path === '/projects' || path.startsWith('/projects/')) {
    if ((user.email ?? '').toLowerCase() !== 'molly@bratttree.com') {
      const url = req.nextUrl.clone();
      url.pathname = '/access-denied';
      return NextResponse.redirect(url);
    }
    return res;
  }

  // The Slack Tags board (and its OAuth routes) is gated to the per-person
  // allowlist in tags-config.ts. Each user sees only their own data (RLS,
  // migrations 059–061).
  if (
    path === '/tags' ||
    path.startsWith('/tags/') ||
    path.startsWith('/api/slack')
  ) {
    if (!isTagsUser(user.email)) {
      const url = req.nextUrl.clone();
      url.pathname = '/access-denied';
      return NextResponse.redirect(url);
    }
    return res;
  }

  // The head arborist's own three pages. They live in three different areas
  // behind three different role checks, so whether he can open all three would
  // otherwise depend on which role he happens to hold. Email-gated instead, the
  // same way My Projects and Slack Tags are.
  //
  // This ADDS a path for one person; it doesn't open the areas around it. He
  // still can't reach the rest of /admin or /production this way. Keep in sync
  // with HEAD_ARBORIST_EMAIL and requireRevenueCalendar() in lib/auth.ts (the
  // address is duplicated here for the same reason the hub matrix below is:
  // middleware runs at the edge and must not import that module).
  const HEAD_ARBORIST_PATHS = [
    '/production/revenue-calendar',
    '/cost-analysis',
    '/admin/video-notes',
  ];
  if (
    (user.email ?? '').toLowerCase() === 'connor@bratttree.com' &&
    HEAD_ARBORIST_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
  ) {
    return res;
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
    // The Office Hub landing is office/dispatch — same audience as Pace.
    { prefix: '/office', hub: 'pace' },
    // Off-Season: entering totals and editing goals stay office-only, but the
    // dashboard/report is viewable by the whole hub audience (incl. sales
    // arborists). More specific prefixes must come first — the matcher takes
    // the first hit. RLS (migration 065) enforces read vs. write to match.
    { prefix: '/off-season/entry', hub: 'pace' },
    { prefix: '/off-season/settings', hub: 'pace' },
    { prefix: '/off-season', hub: 'hub' },
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand|fonts|assets).*)'],
};

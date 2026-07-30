'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth';

export type NavItem = { label: string; href: string };
export type NavGroup = { label: string; items: NavItem[] };

type Props = {
  user: { email: string; role: Role } | null;
  groups: NavGroup[];
  adminGroup?: NavGroup | null;
};

function subtitleFor(pathname: string): string | null {
  if (pathname === '/') return 'The Best & Baddest in Trees';
  if (
    pathname.startsWith('/pace') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/production') ||
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/admin')
  ) {
    return 'Pace Dashboard';
  }
  if (pathname.startsWith('/hub')) return 'Sales Arborist Hub';
  if (pathname.startsWith('/crew')) return 'Field Crew Hub';
  if (
    pathname.startsWith('/office') ||
    pathname.startsWith('/off-season') ||
    pathname.startsWith('/phc') ||
    pathname.startsWith('/sops') ||
    pathname.startsWith('/tags')
  ) {
    return 'Office Hub';
  }
  return null;
}

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The "active" link is the one whose href is the longest prefix of the current
// path — so on /schedule/accuracy, "Forecast vs Actual" wins over the shorter
// "/schedule" ("Tomorrow's Schedule").
function bestMatch(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const it of items) {
    if (isUnder(pathname, it.href) && (best === null || it.href.length > best.length)) {
      best = it.href;
    }
  }
  return best;
}

// Hover/focus dropdown. The menu is always in the DOM; CSS reveals it on
// hover of the group or when anything inside it has keyboard focus
// (`:focus-within`), so mouse, keyboard, and touch all work without JS.
function NavDropdown({
  group,
  activeHref,
}: {
  group: NavGroup;
  activeHref: string | null;
}) {
  const groupActive = group.items.some((i) => i.href === activeHref);

  return (
    <div className={`navgroup${groupActive ? ' active' : ''}`}>
      <button type="button" className="navtrigger" aria-haspopup="true">
        {group.label}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      <div className="navmenu" role="menu">
        {group.items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            role="menuitem"
            className={it.href === activeHref ? 'active' : undefined}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BrandHeaderClient({ user, groups, adminGroup }: Props) {
  const pathname = usePathname();
  const subtitle = subtitleFor(pathname);
  const activeHref = bestMatch(
    pathname,
    [...groups, ...(adminGroup ? [adminGroup] : [])].flatMap((g) => g.items),
  );

  return (
    <header className="site">
      <div className="inner">
        <Link href={user ? '/' : '/login'} className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/assets/img/logotype-color.png" alt="Bratt Tree" />
          {subtitle && <span className="sub">{subtitle}</span>}
        </Link>
        {user && (
          <nav>
            {groups.map((g) =>
              g.items.length === 1 ? (
                // Only one reachable page in this group — show it as a plain
                // link rather than a one-item dropdown.
                <Link
                  key={g.label}
                  href={g.items[0].href}
                  className={g.items[0].href === activeHref ? 'active' : undefined}
                >
                  {g.items[0].label}
                </Link>
              ) : (
                <NavDropdown key={g.label} group={g} activeHref={activeHref} />
              ),
            )}
            <Link
              href="/onboarding"
              className={isUnder(pathname, '/onboarding') ? 'active' : undefined}
            >
              Onboarding
            </Link>
            {adminGroup && (
              <NavDropdown group={adminGroup} activeHref={activeHref} />
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="signout"
                title={`Sign out (${user.email})`}
              >
                Sign Out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}

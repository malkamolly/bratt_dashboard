'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth';

type Props = {
  user: { email: string; role: Role } | null;
};

function subtitleFor(pathname: string): string | null {
  if (pathname === '/') return 'Best & Baddest in Trees';
  if (
    pathname.startsWith('/pace') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/production') ||
    pathname.startsWith('/admin')
  ) {
    return 'Pace Dashboard';
  }
  if (pathname.startsWith('/hub')) return 'Sales Arborist Hub';
  if (pathname.startsWith('/crew')) return 'Field Crew Hub';
  return null;
}

type Section = 'landing' | 'pace' | 'hub' | 'crew' | 'other';

function sectionFor(pathname: string): Section {
  if (pathname === '/') return 'landing';
  if (
    pathname.startsWith('/pace') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/production') ||
    pathname.startsWith('/admin')
  ) {
    return 'pace';
  }
  if (pathname.startsWith('/hub')) return 'hub';
  if (pathname.startsWith('/crew')) return 'crew';
  return 'other';
}

export function BrandHeaderClient({ user }: Props) {
  const pathname = usePathname();
  const subtitle = subtitleFor(pathname);
  const section = sectionFor(pathname);

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
            {section === 'pace' && (
              <>
                <Link href="/sales">Sales</Link>
                <Link href="/production">Production</Link>
              </>
            )}
            {user.role === 'admin' && <Link href="/admin">Admin</Link>}
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

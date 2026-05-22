'use client';

// ============================================================================
// CrewQuickLinks — "Dig deeper" nav that lives at the bottom of every Field
// Crew Hub page (except the landing itself, where it lives inside the hero).
//
// Variants:
//   - default: light styling, drops into a page's normal content area.
//   - dark:    cream-on-brown styling, made to sit inside the brown hero on
//              the /crew landing card.
// ============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Variant = 'default' | 'dark';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/crew/skills', label: 'Skill catalog' },
  { href: '/crew/trainings', label: 'Trainings' },
  { href: '/crew/modules', label: 'Modules' },
  { href: '/crew/plans', label: 'Plans' },
  { href: '/crew/reports', label: 'Reports' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/crew') return pathname === '/crew';
  return pathname === href || pathname.startsWith(href + '/');
}

export function CrewQuickLinks({ variant = 'default' }: { variant?: Variant }) {
  const pathname = usePathname();
  if (variant === 'dark') {
    return (
      <nav aria-label="Field Crew Hub quick links" className="flex flex-wrap gap-2">
        {LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'bt-btn bg-orange text-white hover:bg-orange-press !text-[11px] !px-3 !py-1.5'
                  : 'bt-btn bg-transparent text-cream ring-2 ring-inset ring-cream/40 hover:bg-cream hover:text-ink hover:ring-0 !text-[11px] !px-3 !py-1.5'
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <section className="mt-12">
      <p className="bt-eyebrow">Where to next</p>
      <h2 className="mt-1 font-display text-4xl uppercase tracking-wider text-ink">
        Dig deeper
      </h2>
      <nav
        aria-label="Field Crew Hub quick links"
        className="mt-5 flex flex-wrap gap-3"
      >
        {LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={active ? 'bt-btn bt-btn-primary' : 'bt-btn bt-btn-dark'}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

/**
 * Layout-injected version: renders nothing on /crew (the landing page
 * places CrewQuickLinks inside its hero instead) so we don't double up.
 */
export function CrewQuickLinksAuto() {
  const pathname = usePathname();
  if (pathname === '/crew') return null;
  return <CrewQuickLinks variant="default" />;
}

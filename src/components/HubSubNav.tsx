import Link from 'next/link';

const SECTIONS: { href: string; label: string }[] = [
  { href: '/hub', label: 'Home' },
  { href: '/hub/arborists', label: 'Roster' },
  { href: '/hub/meetings', label: 'Meetings' },
  { href: '/hub/library', label: 'Library' },
  { href: '/hub/onboarding', label: 'Onboarding' },
];

export function HubSubNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-b-2 border-paper-edge pb-4">
      {SECTIONS.map((s) => {
        const isActive = active === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors ${
              isActive
                ? 'text-orange'
                : 'text-fg-2 hover:text-orange-press'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

import Link from 'next/link';

const SECTIONS: { href: string; label: string }[] = [
  { href: '/hub', label: 'Home' },
  { href: '/hub/arborists', label: 'Roster' },
  { href: '/hub/meetings', label: 'Meetings' },
  { href: '/hub/library', label: 'Library' },
];

export function HubSubNav({ active }: { active: string }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-x-3 gap-y-2 border-b-2 border-paper-edge pb-4 sm:gap-x-6">
      {SECTIONS.map((s) => {
        const isActive = active === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`font-headline text-[10px] font-extrabold uppercase tracking-wider transition-colors sm:text-xs sm:tracking-ribbon ${
              isActive ? 'text-orange' : 'text-fg-2 hover:text-orange-press'
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

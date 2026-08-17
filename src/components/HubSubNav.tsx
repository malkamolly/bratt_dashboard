import Link from 'next/link';
import {
  getAllowedUser,
  canUseCalculator,
  canUseSiteMarkup,
  canSeeFollowupScorecard,
} from '@/lib/auth';

const BASE_SECTIONS: { href: string; label: string }[] = [
  { href: '/hub', label: 'Home' },
  { href: '/hub/arborists', label: 'Roster' },
  { href: '/hub/meetings', label: 'Meetings' },
  { href: '/hub/library', label: 'Library' },
];

export async function HubSubNav({ active }: { active: string }) {
  // The Calculator + Site Markup tabs are only shown to managers + admin
  // while they're new.
  const user = await getAllowedUser();
  const sections = [...BASE_SECTIONS];
  if (user && canUseCalculator(user.role)) {
    sections.push({ href: '/hub/calculator', label: 'Calculators' });
  }
  if (user && canUseSiteMarkup(user.role)) {
    sections.push({ href: '/hub/site-plan', label: 'Site Markup' });
  }
  // The Follow-Through Scorecard is embargoed from sales arborists until its
  // release time — see canSeeFollowupScorecard in lib/auth.
  if (user && canSeeFollowupScorecard(user.role)) {
    sections.push({ href: '/hub/followup', label: 'Follow-Through' });
  }
  // The Off-Season report is viewable by the whole hub (view-only for sales
  // arborists; office edits it from the Office Hub).
  sections.push({ href: '/off-season', label: 'Off-Season' });

  return (
    <nav className="mb-8 flex flex-wrap gap-x-3 gap-y-2 border-b-2 border-paper-edge pb-4 sm:gap-x-6">
      {sections.map((s) => {
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

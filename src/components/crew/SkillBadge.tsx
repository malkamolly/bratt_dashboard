// ============================================================================
// SkillBadge — color chip showing L1 / L2 / L3 / unrated.
// ============================================================================
// L1 = learning (orange-tinted)
// L2 = proficient (lime/green-tinted)
// L3 = expert (deep green)
// unrated = neutral
//
// `verbose` adds the word ("Learning" etc.) for the profile tables;
// the default short form ("L2") fits the homepage roster grid.
// ============================================================================

import { clsx } from 'clsx';

type Props = {
  level: 1 | 2 | 3 | null | undefined;
  verbose?: boolean;
  className?: string;
};

const LABEL: Record<1 | 2 | 3, string> = {
  1: 'Learning',
  2: 'Proficient',
  3: 'Expert',
};

export function SkillBadge({ level, verbose = false, className }: Props) {
  if (level == null) {
    return (
      <span
        className={clsx(
          'inline-flex items-center rounded-full px-2.5 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon',
          'bg-paper-edge text-fg-3',
          className,
        )}
      >
        {verbose ? 'Not rated' : '—'}
      </span>
    );
  }

  const styles =
    level === 1
      ? 'bg-orange/15 text-orange-press'
      : level === 2
        ? 'bg-green/15 text-green-dark'
        : 'bg-green-dark text-white';

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon',
        styles,
        className,
      )}
    >
      L{level}
      {verbose ? ` · ${LABEL[level]}` : ''}
    </span>
  );
}

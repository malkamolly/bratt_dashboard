// ============================================================================
// SkillLevelCard
// ============================================================================
// Compact card showing one skill + its current level. Used in the grid on
// the employee profile page. Level drives the card's tint and the chip:
//   L3 → deep green ("Expert")
//   L2 → lime/green ("Proficient")
//   L1 → orange ("Learning")
//   unrated → muted paper-edge
// ============================================================================

type Props = {
  skillName: string;
  level: 1 | 2 | 3 | null | undefined;
};

const LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Learning',
  2: 'Proficient',
  3: 'Expert',
};

export function SkillLevelCard({ skillName, level }: Props) {
  const tone =
    level === 3
      ? 'border-green-dark bg-green-dark/5'
      : level === 2
        ? 'border-green/60 bg-green/5'
        : level === 1
          ? 'border-orange/60 bg-orange/5'
          : 'border-paper-edge bg-paper';

  const chipColor =
    level === 3
      ? 'bg-green-dark text-white'
      : level === 2
        ? 'bg-green/30 text-green-dark'
        : level === 1
          ? 'bg-orange/20 text-orange-press'
          : 'bg-paper-edge text-fg-3';

  return (
    <div className={`flex flex-col justify-between rounded-card border-2 ${tone} p-3`}>
      <span className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-bark-deep">
        {skillName}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-xs font-extrabold uppercase tracking-ribbon ${chipColor}`}
        >
          {level == null ? '—' : `L${level}`}
        </span>
        <span className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
          {level == null ? 'Not rated' : LEVEL_LABEL[level]}
        </span>
      </div>
    </div>
  );
}

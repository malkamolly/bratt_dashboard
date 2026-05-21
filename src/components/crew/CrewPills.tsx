// ============================================================================
// Small pill components used across the Field Crew Hub:
//   - ForemanPill: marks an employee as their crew's foreman.
//   - SpecialtyPill: equipment-operator specialty (Knuckleboom, Crane, etc.).
// ============================================================================

import { clsx } from 'clsx';

export function ForemanPill({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full bg-bark text-cream font-headline font-extrabold uppercase tracking-ribbon',
        size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[10px]',
      )}
    >
      Foreman
    </span>
  );
}

const SPECIALTY_COLORS: Record<string, string> = {
  stump: 'bg-wood text-cream',
  clam: 'bg-teal text-white',
  knuckleboom: 'bg-orange text-white',
  crane: 'bg-bark-deep text-cream',
};

export function SpecialtyPill({
  specialtyKey,
  label,
  size = 'sm',
}: {
  specialtyKey: string;
  label: string;
  size?: 'sm' | 'md';
}) {
  const color = SPECIALTY_COLORS[specialtyKey] ?? 'bg-sand text-ink';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-headline font-extrabold uppercase tracking-ribbon',
        color,
        size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[10px]',
      )}
    >
      {label}
    </span>
  );
}

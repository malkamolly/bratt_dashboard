// ============================================================================
// Small pill components used across the Field Crew Hub.
// ============================================================================
// Kept subtle on purpose — these show up next to every crew name in the
// roster grid, so heavy fills create noise. Outlined treatment for foremen,
// tonal-fill chips for equipment-operator specialties.
// ============================================================================

import { clsx } from 'clsx';

export function ForemanPill({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      title="Foreman"
      className={clsx(
        'inline-flex items-center rounded-full border border-bark-deep/40 text-fg-2 font-headline font-extrabold uppercase tracking-ribbon align-middle',
        size === 'sm' ? 'px-1.5 py-0 text-[8px]' : 'px-2 py-0.5 text-[10px]',
      )}
    >
      Foreman
    </span>
  );
}

const SPECIALTY_COLORS: Record<string, string> = {
  stump: 'border-wood text-wood',
  clam: 'border-teal text-teal',
  knuckleboom: 'border-orange text-orange-press',
  crane: 'border-bark-deep text-bark-deep',
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
  const color = SPECIALTY_COLORS[specialtyKey] ?? 'border-sand text-sand';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border font-headline font-extrabold uppercase tracking-ribbon align-middle',
        color,
        size === 'sm' ? 'px-1.5 py-0 text-[8px]' : 'px-2 py-0.5 text-[10px]',
      )}
    >
      {label}
    </span>
  );
}

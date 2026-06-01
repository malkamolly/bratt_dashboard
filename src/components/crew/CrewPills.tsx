// ============================================================================
// Small pill components used across the Field Crew Hub.
// ============================================================================
// Kept subtle on purpose — these show up next to every crew name in the
// roster grid, so heavy fills create noise. Foreman is just an emoji; the
// rest are tiny outlined chips.
// ============================================================================

import { clsx } from 'clsx';

// Foreman is shown as a hard-hat emoji rather than a text pill — it reads at a
// glance and keeps the name row uncluttered.
export function ForemanPill({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      title="Foreman"
      aria-label="Foreman"
      role="img"
      className={clsx('align-middle leading-none', size === 'sm' ? 'text-[11px]' : 'text-sm')}
    >
      👷
    </span>
  );
}

const PILL_BASE =
  'inline-flex items-center rounded-full border font-headline font-extrabold uppercase align-middle';

const PILL_SIZE: Record<'sm' | 'md', string> = {
  sm: 'px-1 py-0 text-[8px] tracking-wide',
  md: 'px-2 py-0.5 text-[10px] tracking-ribbon',
};

export function CdlPill({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span title="Holds a CDL" className={clsx(PILL_BASE, 'border-teal text-teal', PILL_SIZE[size])}>
      CDL
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
  return <span className={clsx(PILL_BASE, color, PILL_SIZE[size])}>{label}</span>;
}

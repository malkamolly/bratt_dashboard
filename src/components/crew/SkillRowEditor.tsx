'use client';

// ============================================================================
// SkillRowEditor — one row per employee on /crew/skills/[key]. Renders the
// current level as a 4-button segmented control (—, L1, L2, L3). Clicking
// a different button fires the server action; clicking the current button
// is a no-op. View-only viewers see colored chips with no buttons.
// ============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setEmployeeSkillLevel } from '@/app/crew/actions';
import type { SkillEmployeeRecord } from '@/lib/crew-data';

type Props = {
  record: SkillEmployeeRecord;
  skillKey: string;
  editable: boolean;
};

const CHOICES: Array<{ value: 0 | 1 | 2 | 3; label: string; title: string }> = [
  { value: 0, label: '—', title: 'No rating' },
  { value: 1, label: 'L1', title: 'Learning' },
  { value: 2, label: 'L2', title: 'Proficient' },
  { value: 3, label: 'L3', title: 'Expert' },
];

function levelClass(level: 1 | 2 | 3 | null, selected: boolean): string {
  const base =
    'h-8 min-w-[2.25rem] px-2 font-headline text-xs font-extrabold uppercase tracking-ribbon transition-colors';
  if (!selected) {
    return `${base} bg-paper text-fg-3 hover:bg-paper-edge`;
  }
  if (level === null) return `${base} bg-paper-edge text-bark-deep`;
  if (level === 1) return `${base} bg-orange text-white`;
  if (level === 2) return `${base} bg-green text-white`;
  return `${base} bg-green-dark text-white`;
}

export function SkillRowEditor({ record, skillKey, editable }: Props) {
  const router = useRouter();
  const [level, setLevel] = useState<1 | 2 | 3 | null>(record.level);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: 0 | 1 | 2 | 3) {
    const nextLevel = next === 0 ? null : next;
    if (nextLevel === level) return;
    setError(null);
    setLevel(nextLevel);
    startTransition(async () => {
      const res = await setEmployeeSkillLevel({
        employee_slug: record.employee_slug,
        skill_key: skillKey,
        level: next,
      });
      if (!res.ok) {
        setError(res.error);
        setLevel(record.level); // revert
      } else {
        router.refresh();
      }
    });
  }

  return (
    <tr className="border-t border-paper-edge/60">
      <td className="px-3 py-2">
        <Link
          href={`/crew/employees/${record.employee_slug}`}
          className="font-headline font-extrabold text-bark-deep hover:underline"
        >
          {record.employee_name}
        </Link>
        {record.position_name && (
          <div className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3">
            {record.position_name}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <div
            role="radiogroup"
            aria-label={`Level for ${record.employee_name}`}
            className="inline-flex overflow-hidden rounded-2 border-2 border-paper-edge"
          >
            {CHOICES.map((c) => {
              const selectedValue: 0 | 1 | 2 | 3 = level ?? 0;
              const selected = c.value === selectedValue;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={c.title}
                  disabled={isPending}
                  onClick={() => choose(c.value)}
                  className={levelClass(level, selected)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        ) : (
          <LevelBadge level={level} />
        )}
        {error && (
          <div className="mt-1 text-xs text-orange-press">{error}</div>
        )}
      </td>
    </tr>
  );
}

function LevelBadge({ level }: { level: 1 | 2 | 3 | null }) {
  if (level === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-paper-edge px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-2">
        Not rated
      </span>
    );
  }
  const color =
    level === 1
      ? 'bg-orange text-white'
      : level === 2
        ? 'bg-green text-white'
        : 'bg-green-dark text-white';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${color}`}
    >
      L{level}
    </span>
  );
}

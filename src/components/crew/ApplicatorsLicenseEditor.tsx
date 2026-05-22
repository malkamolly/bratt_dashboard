'use client';

// ============================================================================
// ApplicatorsLicenseEditor — segmented control on the PHC card.
// Renders four buttons: Not yet · In progress · Passed · Failed. Click a
// different button to update the status server-side. Optimistic update;
// reverts on error.
// ============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setApplicatorsLicenseStatus,
  type LicenseStatus,
} from '@/app/crew/actions';

type Props = {
  employeeSlug: string;
  current: 'passed' | 'in_progress' | 'failed' | null;
  editable: boolean;
};

const CHOICES: Array<{ value: LicenseStatus; label: string; tone: string }> = [
  { value: 'not_yet',     label: 'Not yet',     tone: 'bg-paper-edge text-fg-2' },
  { value: 'in_progress', label: 'In progress', tone: 'bg-status-warn/30 text-orange-press' },
  { value: 'passed',      label: 'Passed',      tone: 'bg-green-dark text-white' },
  { value: 'failed',      label: 'Failed',      tone: 'bg-orange-press text-white' },
];

function asLicenseStatus(c: 'passed' | 'in_progress' | 'failed' | null): LicenseStatus {
  return c === null ? 'not_yet' : c;
}

export function ApplicatorsLicenseEditor({ employeeSlug, current, editable }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<LicenseStatus>(asLicenseStatus(current));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    const choice = CHOICES.find((c) => c.value === value)!;
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 font-headline text-[10px] font-extrabold uppercase tracking-ribbon ${choice.tone}`}
      >
        {choice.label}
      </span>
    );
  }

  function choose(next: LicenseStatus) {
    if (next === value) return;
    const prev = value;
    setError(null);
    setValue(next);
    startTransition(async () => {
      const res = await setApplicatorsLicenseStatus({
        employee_slug: employeeSlug,
        status: next,
      });
      if (!res.ok) {
        setError(res.error);
        setValue(prev);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div
        role="radiogroup"
        aria-label="Applicator's License status"
        className="inline-flex overflow-hidden rounded-2 border-2 border-paper-edge"
      >
        {CHOICES.map((c) => {
          const selected = c.value === value;
          const base =
            'h-7 px-2 font-headline text-[10px] font-extrabold uppercase tracking-ribbon transition-colors';
          const cls = selected
            ? `${base} ${c.tone}`
            : `${base} bg-paper text-fg-3 hover:bg-paper-edge`;
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isPending}
              onClick={() => choose(c.value)}
              className={cls}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {error && <span className="text-[10px] text-orange-press">{error}</span>}
    </div>
  );
}

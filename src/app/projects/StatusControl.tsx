'use client';

import { useTransition } from 'react';
import { setProjectStatus, setItemStatus } from './actions';
import { STATUSES, STATUS_CLASSES, type Status } from './status';

// A color-coded dropdown that saves the new status as soon as you pick it.
// `kind` decides which server action runs — projects and items live in
// different tables but share the same three statuses.
export function StatusControl({
  id,
  kind,
  status,
}: {
  id: string;
  kind: 'project' | 'item';
  status: Status;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={status}
      disabled={pending}
      aria-label="Status"
      onChange={(e) => {
        const next = e.target.value as Status;
        startTransition(async () => {
          if (kind === 'project') {
            await setProjectStatus(id, next);
          } else {
            await setItemStatus(id, next);
          }
        });
      }}
      className={`rounded-full border px-2 py-1 text-xs font-semibold ${STATUS_CLASSES[status]} ${
        pending ? 'opacity-50' : ''
      }`}
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

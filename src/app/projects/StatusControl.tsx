'use client';

import { useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
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
    <span
      className={`relative inline-flex items-center rounded-full border text-xs font-semibold ${STATUS_CLASSES[status]} ${
        pending ? 'opacity-50' : ''
      }`}
    >
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
        // appearance-none drops the browser's default arrow so we can place
        // our own snug against the label instead of it floating at the edge.
        className="cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-3 pr-6 font-semibold focus:outline-none"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2"
        aria-hidden
      />
    </span>
  );
}

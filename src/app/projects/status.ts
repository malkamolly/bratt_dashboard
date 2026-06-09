// Shared status vocabulary for the My Projects hub. Imported by both the
// server page and the client status control, so it lives in a plain module
// (no 'use server' / 'use client' directive).

export type Status = 'not_started' | 'in_progress' | 'done';

export const STATUSES: { value: Status; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

export function isStatus(value: string): value is Status {
  return value === 'not_started' || value === 'in_progress' || value === 'done';
}

export function statusLabel(status: Status): string {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}

// Tailwind classes for the little status pill / select, color-coded so the
// board is scannable: gray = not started, amber = in progress, green = done.
export const STATUS_CLASSES: Record<Status, string> = {
  not_started: 'bg-cream text-fg-2 border-line',
  in_progress: 'bg-amber-100 text-amber-800 border-amber-300',
  done: 'bg-green-100 text-green-800 border-green-300',
};

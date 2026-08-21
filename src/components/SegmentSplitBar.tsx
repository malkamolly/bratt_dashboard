// ============================================================================
// Residential vs commercial split
// ============================================================================
// One row, two figures. Deliberately not a chart: there are only ever two (or
// three) values, and the numbers themselves are what someone acts on.
//
// Why it's worth showing at all: commercial accounts pay on their own 60-90 day
// AP cycle, so a commercial-heavy book looks alarming on an aging report
// without actually being neglected. Splitting it means "61+ days" can be read
// correctly instead of read as failure.
// ============================================================================

import { fmtUsd } from '@/lib/format';
import type { SegmentSplit } from '@/lib/receivables';

export function SegmentSplitBar({
  split,
  className = '',
}: {
  // Optional on purpose: reads go through hydrateReceivables, but this renders
  // a stored payload and must not be the thing that takes the page down if a
  // field is ever missing. A absent split means "nothing to show", not a crash.
  split: SegmentSplit | null | undefined;
  className?: string;
}) {
  if (!split?.residential || !split.commercial || !split.unknown) return null;

  const total =
    split.residential.balance + split.commercial.balance + split.unknown.balance;
  if (total <= 0) return null;

  // Nothing to split when the export predates the Customer Type column — the
  // honest move is to say so once, not to render a bar that is 100% "unknown".
  if (split.residential.count === 0 && split.commercial.count === 0) {
    return (
      <p className={`text-xs text-fg-3 ${className}`}>
        This report has no Customer Type column, so residential and commercial
        can&apos;t be separated. Re-run the export with that column to split it.
      </p>
    );
  }

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const rows = [
    { key: 'commercial', label: 'Commercial', ...split.commercial },
    { key: 'residential', label: 'Residential', ...split.residential },
    ...(split.unknown.count > 0
      ? [{ key: 'unknown', label: 'Not specified', ...split.unknown }]
      : []),
  ];

  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full border-2 border-ink">
        {rows.map((r) => (
          <div
            key={r.key}
            style={{ width: pct(r.balance) }}
            className={
              r.key === 'commercial'
                ? 'bg-teal-navy'
                : r.key === 'residential'
                  ? 'bg-lime'
                  : 'bg-paper-edge'
            }
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
        {rows.map((r) => (
          <li key={r.key} className="text-xs">
            <span
              className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle ${
                r.key === 'commercial'
                  ? 'bg-teal-navy'
                  : r.key === 'residential'
                    ? 'bg-lime'
                    : 'bg-paper-edge'
              }`}
            />
            <span className="font-headline font-extrabold uppercase tracking-ribbon text-fg-2">
              {r.label}
            </span>{' '}
            <strong className="font-headline font-black text-ink">
              {fmtUsd(r.balance)}
            </strong>{' '}
            <span className="text-fg-3">
              ({r.count} inv &middot; {pct(r.balance)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

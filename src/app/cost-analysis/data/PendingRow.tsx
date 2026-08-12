'use client';

// ============================================================================
// One row of the pending-review queue, editable in place
// ============================================================================
// Reviewing an upload means fixing measurements the parser couldn't read from the
// description text — so the pencil turns this row's cells into inputs instead of
// navigating to the full edit screen and back. Same `editJob` action either way.
//
// A table row can't be wrapped in a <form> (invalid HTML), so the form element
// lives in the last cell and every input points at it by id via the `form`
// attribute. That's what lets a single Save submit inputs scattered across cells.
//
// IMPORTANT: editJob rebuilds the whole row from the submitted fields, so any
// field this editor doesn't send comes back as null. Hauling, the note and the
// price adjustment aren't editable here, so they ride along as hidden inputs —
// without them, saving a DBH fix would silently wipe the parser's note, flip a
// no-haul job to hauling, and drop any price adjustment.
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { fmtUsd } from '@/lib/format';
import type { RemovalEntry, EntryStatus } from '@/lib/removal-entries';
import { editJob } from '../jobs/actions';
import { setEntryStatus } from './actions';

const RETURN_TO = '/cost-analysis/data';

export type Badge = { label: string; tone: 'good' | 'warn' | 'muted'; reason?: string };

const BADGE: Record<Badge['tone'], string> = {
  good: 'bg-lime/30 text-bark-deep',
  warn: 'bg-status-warn/40 text-ink',
  muted: 'bg-paper-edge/50 text-fg-2',
};

const CELL = 'py-2 pr-3';
const INPUT =
  'w-full rounded border-2 border-orange/40 bg-white px-1.5 py-1 text-xs text-ink focus:border-orange focus:outline-none';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-orange px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white hover:bg-bark-deep disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}

export default function PendingRow({
  entry: e,
  badge,
  detail,
}: {
  entry: RemovalEntry;
  badge: Badge;
  detail?: string;
}) {
  const [editing, setEditing] = useState(false);
  const formId = `edit-${e.id}`;

  if (!editing) {
    return (
      <>
        <tr className="border-b border-bark/10 align-middle">
          <td className={`${CELL} font-bold text-ink`}>
            {e.inv}
            {!e.haul && <span className="ml-1 text-[10px] text-fg-3">(no haul)</span>}
          </td>
          <td className={`${CELL} whitespace-nowrap text-fg-2`}>{e.date ?? '—'}</td>
          <td className={`${CELL} text-ink`}>
            {e.dbh != null ? `${e.dbh}"` : '—'}
            {e.stems > 1 && (
              <span className="ml-1 whitespace-nowrap text-[10px] font-bold text-fg-3">
                ×{e.stems} trunks
              </span>
            )}
          </td>
          <td className={`${CELL} text-fg-2`}>{e.height != null ? `${e.height}′` : '—'}</td>
          <td className={`${CELL} text-fg-2`}>{e.crown != null ? `${e.crown}′` : '—'}</td>
          <td className={`${CELL} font-bold text-orange`}>
            {e.price != null ? fmtUsd(e.price) : '—'}
          </td>
          <td className={`${CELL} text-fg-2`}>{e.species ?? '—'}</td>
          <td className={`${CELL} text-fg-2`}>{e.seller ?? '—'}</td>
          <td className={CELL}>
            <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${BADGE[badge.tone]}`}>
              {badge.label}
            </span>
            {badge.reason && <span className="ml-1 text-[10px] text-fg-3">{badge.reason}</span>}
          </td>
          <td className="py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded px-1.5 py-1 text-base hover:bg-lime/30"
                title="Fix this row without leaving the page"
                aria-label="Edit job inline"
              >
                ✏️
              </button>
              <StatusButton id={e.id} status="included" current={e.status} label="Include" tone="good" />
              <StatusButton id={e.id} status="removed" current={e.status} label="Remove" tone="bad" />
            </div>
          </td>
        </tr>
        {detail && (
          <tr className="border-b border-bark/10">
            <td colSpan={10} className="max-w-0 truncate pb-2 pr-3 text-[11px] text-fg-3" title={detail}>
              {detail}
            </td>
          </tr>
        )}
      </>
    );
  }

  return (
    <>
      <tr className="border-b border-bark/10 bg-lime/10 align-middle">
        <td className={`${CELL} font-bold text-ink`}>{e.inv}</td>
        <td className={CELL}>
          <input form={formId} type="date" name="date" defaultValue={e.date ?? ''} className={INPUT} />
        </td>
        <td className={CELL}>
          <input
            form={formId}
            type="number"
            step="0.1"
            name="dbh"
            defaultValue={e.dbh ?? ''}
            placeholder="DBH"
            aria-label="DBH in inches"
            className={INPUT}
          />
          <input
            form={formId}
            type="number"
            step="1"
            min="1"
            name="stems"
            defaultValue={e.stems}
            aria-label="Number of trunks"
            className={`${INPUT} mt-1`}
          />
          <span className="text-[9px] uppercase text-fg-3">trunks</span>
        </td>
        <td className={CELL}>
          <input
            form={formId}
            type="number"
            step="0.1"
            name="height"
            defaultValue={e.height ?? ''}
            placeholder="ht"
            aria-label="Height in feet"
            className={INPUT}
          />
        </td>
        <td className={CELL}>
          <input
            form={formId}
            type="number"
            step="0.1"
            name="crown"
            defaultValue={e.crown ?? ''}
            placeholder="crown"
            aria-label="Crown spread in feet"
            className={INPUT}
          />
        </td>
        {/* Price stays read-only: it's the billed amount off the invoice. Changing
            it means recording an adjustment, which is the full editor's job. */}
        <td className={`${CELL} font-bold text-orange`}>
          {e.price != null ? fmtUsd(e.price) : '—'}
        </td>
        <td className={CELL}>
          <input
            form={formId}
            type="text"
            name="species"
            defaultValue={e.species ?? ''}
            placeholder="species"
            aria-label="Species"
            className={INPUT}
          />
        </td>
        <td className={CELL}>
          <input
            form={formId}
            type="text"
            name="seller"
            defaultValue={e.seller ?? ''}
            placeholder="Patrick W"
            aria-label="Sold by"
            className={INPUT}
          />
        </td>
        {/* Nothing in the Hub export flags a municipal job, so review is where it
            gets set — which makes this the one checkbox worth having in the row. */}
        <td className={CELL}>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-fg-2">
            <input form={formId} type="checkbox" name="muni" defaultChecked={e.muni} className="h-3.5 w-3.5" />
            Municipal
          </label>
        </td>
        <td className="py-2">
          <div className="flex items-center gap-1.5">
            <form id={formId} action={editJob}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="returnTo" value={RETURN_TO} />
              {/* Keep validation errors on this page instead of bouncing to the
                  full edit screen. */}
              <input type="hidden" name="errorTo" value={RETURN_TO} />
              {/* Ride-alongs: see the note at the top of this file. */}
              <input type="hidden" name="haul" value={e.haul ? 'yes' : 'no'} />
              <input type="hidden" name="note" value={e.note ?? ''} />
              <input type="hidden" name="adjusted_price" value={e.adjustedPrice ?? ''} />
              <SaveButton />
            </form>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded px-2 py-1 text-xs font-bold uppercase tracking-wide text-fg-2 hover:text-orange"
            >
              Cancel
            </button>
          </div>
          <Link
            href={`/cost-analysis/jobs/${e.id}/edit?returnTo=${encodeURIComponent(RETURN_TO)}`}
            className="mt-1 block text-[10px] font-bold uppercase text-fg-3 hover:text-orange"
          >
            Price &amp; note &rarr;
          </Link>
        </td>
      </tr>
      {detail && (
        <tr className="border-b border-bark/10 bg-lime/10">
          <td colSpan={10} className="pb-2 pr-3 text-[11px] leading-snug text-fg-3">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}

function StatusButton({
  id,
  status,
  current,
  label,
  tone,
}: {
  id: string;
  status: EntryStatus;
  current: EntryStatus;
  label: string;
  tone: 'good' | 'bad';
}) {
  const active = current === status;
  const cls = active
    ? 'cursor-default bg-bark/10 text-fg-3'
    : tone === 'good'
    ? 'bg-lime/30 text-bark-deep hover:bg-lime/60'
    : 'bg-paper-edge/50 text-fg-2 hover:bg-orange/20';
  return (
    <form action={setEntryStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={active}
        className={`rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${cls}`}
      >
        {active ? `✓ ${label}d` : label}
      </button>
    </form>
  );
}

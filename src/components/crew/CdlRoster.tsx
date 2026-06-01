'use client';

// ============================================================================
// CdlRoster — drag-to-reorder list for the CDL tracker (/crew/cdl).
// ============================================================================
// Managers drag a row by its grip handle to reorder; the new order saves in
// the background (reorderCdlTrack). Stage changes and removals still go through
// their own server-action forms. Non-managers get a plain, static list.
// ============================================================================

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { CDL_STAGES, cdlStageLabel } from '@/lib/cdl';
import { setCdlStage, removeCdlTrainee, reorderCdlTrack } from '@/app/crew/actions';

export type CdlRosterItem = { slug: string; name: string; stage: number };

export function CdlRoster({
  items,
  editable,
}: {
  items: CdlRosterItem[];
  editable: boolean;
}) {
  const [order, setOrder] = useState<CdlRosterItem[]>(items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync from the server when the underlying data actually changes
  // (a stage update, add, or remove triggers a fresh render).
  const sig = items.map((i) => `${i.slug}:${i.stage}`).join('|');
  useEffect(() => {
    setOrder(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  function handleDrop(targetIdx: number) {
    setOverIdx(null);
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setDragIdx(null);
    setOrder(next);
    startTransition(() => {
      reorderCdlTrack(next.map((i) => i.slug));
    });
  }

  if (order.length === 0) {
    return <p className="mt-3 text-sm text-fg-3">Nobody on the CDL track yet.</p>;
  }

  return (
    <ul className="mt-4 divide-y divide-paper-edge overflow-hidden rounded-card border border-paper-edge bg-paper">
      {order.map((t, i) => (
        <li
          key={t.slug}
          draggable={editable}
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => {
            if (dragIdx === null) return;
            e.preventDefault();
            setOverIdx(i);
          }}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => {
            setDragIdx(null);
            setOverIdx(null);
          }}
          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
            overIdx === i && dragIdx !== null ? 'bg-bone' : ''
          } ${dragIdx === i ? 'opacity-50' : ''}`}
        >
          <div className="flex items-center gap-2">
            {editable && (
              <span
                aria-hidden
                title="Drag to reorder"
                className="cursor-grab select-none px-1 font-headline text-base leading-none text-fg-3"
              >
                ⠿
              </span>
            )}
            <Link
              href={`/crew/employees/${t.slug}`}
              className="font-headline text-base font-extrabold text-bark-deep hover:underline"
            >
              {t.name}
            </Link>
          </div>
          {editable ? (
            <div className="flex items-center gap-2">
              <form action={setCdlStage} className="flex items-center gap-2">
                <input type="hidden" name="employee_slug" value={t.slug} />
                <select
                  name="stage"
                  defaultValue={t.stage}
                  className="rounded-2 border-2 border-paper-edge bg-cream px-2 py-1 font-headline text-xs font-extrabold uppercase tracking-ribbon text-bark-deep"
                >
                  {CDL_STAGES.map((label, idx) => (
                    <option key={label} value={idx + 1}>
                      {idx + 1}. {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="bt-btn bt-btn-dark !text-[10px] !px-2 !py-1">
                  Update
                </button>
              </form>
              <form action={removeCdlTrainee}>
                <input type="hidden" name="employee_slug" value={t.slug} />
                <button
                  type="submit"
                  title="Remove from the CDL track"
                  className="font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-fg-3 hover:text-orange-press"
                >
                  Remove
                </button>
              </form>
            </div>
          ) : (
            <span className="inline-flex items-center rounded-full bg-bark-deep px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-ribbon text-cream">
              {t.stage}. {cdlStageLabel(t.stage)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

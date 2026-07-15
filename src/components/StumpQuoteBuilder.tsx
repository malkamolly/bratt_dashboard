'use client';

import { useMemo, useState } from 'react';
import { priceForStump, stumpBandLabel } from '@/lib/stump-pricing';
import { fmtUsd } from '@/lib/format';

type Line = {
  /** Stable client-side key for React. */
  key: string;
  dia: string;
  qty: string;
};

let keyCounter = 0;
function newLine(): Line {
  keyCounter += 1;
  return { key: `stump-${keyCounter}`, dia: '', qty: '1' };
}

function parseDia(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseQty(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function StumpQuoteBuilder() {
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function add() {
    setLines((ls) => [...ls, newLine()]);
  }
  function remove(key: string) {
    setLines((ls) => (ls.length === 1 ? [newLine()] : ls.filter((l) => l.key !== key)));
  }
  function reset() {
    setLines([newLine()]);
  }

  // Per-line computed results (band label, per-stump price, line total).
  const computed = useMemo(
    () =>
      lines.map((l) => {
        const dia = parseDia(l.dia);
        const qty = parseQty(l.qty);
        const label = stumpBandLabel(dia);
        if (dia <= 0) {
          return { qty, unit: null as number | null, total: null as number | null, label };
        }
        const res = priceForStump(dia);
        if (res.ok) {
          return { qty, unit: res.price, total: res.price * qty, label };
        }
        return { qty, unit: null, total: null, label };
      }),
    [lines],
  );

  const grandTotal = useMemo(
    () => computed.reduce((sum, c) => sum + (c.total ?? 0), 0),
    [computed],
  );

  // Any line with more than one stump is a reminder that clustered stumps
  // need Review-team pricing.
  const hasMultiple = computed.some((c) => c.qty > 1);

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {lines.map((line, idx) => {
          const c = computed[idx];
          return (
            <li key={line.key} className="bt-card !p-4 sm:!p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px_90px_auto] sm:items-end">
                {/* Stump diameter */}
                <label className="flex flex-col gap-1">
                  <span className="bt-eyebrow">Stump diameter (in)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.dia}
                    onChange={(e) => update(line.key, { dia: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                  />
                </label>

                {/* Band label (read-only helper) */}
                <div className="flex flex-col gap-1">
                  <span className="bt-eyebrow">Range</span>
                  <span className="px-1 py-2 font-headline text-sm text-fg-2">
                    {c.label ?? '—'}
                  </span>
                </div>

                {/* Quantity */}
                <label className="flex flex-col gap-1">
                  <span className="bt-eyebrow"># Stumps</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(e) => update(line.key, { qty: e.target.value })}
                    placeholder="1"
                    className="w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                  />
                </label>

                {/* Line total + remove */}
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-end">
                  <span className="font-headline text-xl font-black text-ink">
                    {c.total != null ? fmtUsd(c.total) : '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(line.key)}
                    title="Remove this line"
                    aria-label="Remove this line"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper-edge text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Per-line detail: per-stump price × quantity. */}
              {c.unit != null && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper-edge/60 pt-3 text-xs text-fg-2">
                  <span>
                    <strong className="text-ink">{fmtUsd(c.unit)}</strong> per stump
                    {c.qty > 1 && <> &times; {c.qty}</>}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <button type="button" onClick={add} className="bt-btn bt-btn-ghost">
            + Add another stump
          </button>
          <button type="button" onClick={reset} className="bt-btn bt-btn-ghost">
            Clear all
          </button>
        </div>

        <div className="rounded-card bg-bark px-6 py-4 text-cream sm:min-w-[280px]">
          <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
            Quote Total
          </p>
          <p className="mt-1 font-display text-4xl tracking-wider">{fmtUsd(grandTotal)}</p>
          {hasMultiple && (
            <p className="mt-1 text-xs text-cream/80">
              Stumps within a 2 ft area may be priced differently — see the 2 ft rule above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

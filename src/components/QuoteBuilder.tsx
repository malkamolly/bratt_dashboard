'use client';

import { useMemo, useState } from 'react';
import {
  SERVICES,
  SERVICES_BY_ID,
  SERVICE_CATEGORIES,
  priceForDbh,
  pricingSummary,
  type Service,
} from '@/lib/phc-pricing';
import { fmtUsd } from '@/lib/format';

type Line = {
  /** Stable client-side key for React. */
  key: string;
  serviceId: string;
  dbh: string;
  qty: string;
};

let keyCounter = 0;
function newLine(): Line {
  keyCounter += 1;
  return { key: `line-${keyCounter}`, serviceId: '', dbh: '', qty: '1' };
}

function parseDbh(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseQty(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function QuoteBuilder() {
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

  // Per-line computed results (service, unit price, line total, any note).
  const computed = useMemo(
    () =>
      lines.map((l) => {
        const service = l.serviceId ? SERVICES_BY_ID.get(l.serviceId) ?? null : null;
        const dbh = parseDbh(l.dbh);
        const qty = parseQty(l.qty);
        if (!service || dbh <= 0) {
          return { service, qty, unit: null as number | null, total: null as number | null, note: null as string | null };
        }
        const res = priceForDbh(service, dbh);
        if (res.ok) {
          return { service, qty, unit: res.price, total: res.price * qty, note: null };
        }
        return { service, qty, unit: null, total: null, note: res.reason };
      }),
    [lines],
  );

  const grandTotal = useMemo(
    () => computed.reduce((sum, c) => sum + (c.total ?? 0), 0),
    [computed],
  );

  const hasConsultLine = computed.some((c) => c.note != null);

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lines.map((line, idx) => {
          const c = computed[idx];
          const service = c.service;
          return (
            <li key={line.key} className="bt-card flex flex-col gap-3 !p-4">
              {/* Header: line label + remove */}
              <div className="flex items-start justify-between">
                <span className="bt-eyebrow">Line {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(line.key)}
                  title="Remove this line"
                  aria-label="Remove this line"
                  className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper-edge text-fg-3 transition-colors hover:border-orange-press hover:bg-orange-press hover:text-white"
                >
                  ×
                </button>
              </div>

              {/* Service picker */}
              <label className="flex flex-col gap-1">
                <span className="bt-eyebrow">Service</span>
                <select
                  value={line.serviceId}
                  onChange={(e) => update(line.key, { serviceId: e.target.value })}
                  className="w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 font-headline text-sm focus:border-orange focus:outline-none"
                >
                  <option value="">— pick a treatment —</option>
                  {SERVICE_CATEGORIES.map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {SERVICES.filter((s) => s.category === cat).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {/* DBH + quantity side by side */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="bt-eyebrow">DBH (in)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.dbh}
                    onChange={(e) => update(line.key, { dbh: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="bt-eyebrow"># Trees</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(e) => update(line.key, { qty: e.target.value })}
                    placeholder="1"
                    className="w-full rounded-2 border-2 border-paper-edge bg-white px-3 py-2 text-right font-headline text-base focus:border-orange focus:outline-none"
                  />
                </label>
              </div>

              {/* Per-line detail: pricing summary, method, frequency */}
              {service && <ServiceMeta service={service} />}

              {c.note && (
                <p className="rounded-2 border-2 border-orange-press bg-orange/10 px-3 py-2 text-sm font-bold text-orange-press">
                  {c.note}
                </p>
              )}
              {service?.heightLimit && c.unit != null && (
                <p className="text-xs text-fg-3">
                  Note: this chart price does <strong>not</strong> apply to trees over 25 ft
                  tall — consult PHC Manager (Connor) for those.
                </p>
              )}

              {/* Line total */}
              <div className="mt-auto flex items-end justify-between border-t border-paper-edge/60 pt-3">
                <span className="text-xs text-fg-2">
                  {c.unit != null ? (
                    <>
                      <strong className="text-ink">{fmtUsd(c.unit)}</strong> each
                      {c.qty > 1 && <> &times; {c.qty}</>}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="font-headline text-xl font-black text-ink">
                  {c.total != null ? fmtUsd(c.total) : '—'}
                </span>
              </div>
            </li>
          );
        })}

        {/* Add-another tile, sized to match a card */}
        <li>
          <button
            type="button"
            onClick={add}
            className="flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-paper-edge text-fg-3 transition-colors hover:border-orange hover:text-orange-press"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="font-headline text-xs font-extrabold uppercase tracking-ribbon">
              Add tree / service
            </span>
          </button>
        </li>
      </ul>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={reset} className="bt-btn bt-btn-ghost">
          Clear all
        </button>

        <div className="rounded-card bg-bark px-6 py-4 text-cream sm:min-w-[280px]">
          <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-lime">
            Quote Total
          </p>
          <p className="mt-1 font-display text-4xl tracking-wider">{fmtUsd(grandTotal)}</p>
          {hasConsultLine && (
            <p className="mt-1 text-xs text-cream/80">
              Some lines need a manager quote and aren&apos;t included above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceMeta({ service }: { service: Service }) {
  const bits: string[] = [];
  if (service.treatmentType) bits.push(service.treatmentType);
  if (service.chemical) bits.push(service.chemical);
  if (service.targetSpecies) bits.push(service.targetSpecies);
  if (service.frequency) bits.push(service.frequency);
  if (service.sprays) bits.push(service.sprays);
  return (
    <div className="space-y-0.5 text-xs text-fg-3">
      <div>{pricingSummary(service)}</div>
      {bits.length > 0 && <div>{bits.join(' · ')}</div>}
    </div>
  );
}

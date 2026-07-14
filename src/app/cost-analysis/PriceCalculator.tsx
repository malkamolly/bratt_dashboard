'use client';

// ============================================================================
// Suggested-price calculator. Enter a tree's DBH / height / crown and see the
// modeled removal price from PRICING_MODEL. Pure client-side; no data leaves.
// ============================================================================

import { useState } from 'react';
import { PRICING_MODEL, modelPrice } from '@/lib/cost-analysis';
import { fmtUsd } from '@/lib/format';

function Field({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-extrabold uppercase tracking-wide text-fg-2">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-md border-2 border-bark/25 bg-white px-2 py-1.5 text-lg font-bold text-ink focus:border-orange focus:outline-none"
        />
        <span className="text-sm text-fg-3">{unit}</span>
      </span>
    </label>
  );
}

export function PriceCalculator() {
  const [dbh, setDbh] = useState('20');
  const [height, setHeight] = useState('40');
  const [crown, setCrown] = useState('20');

  const d = parseFloat(dbh);
  const h = height.trim() === '' ? null : parseFloat(height);
  const c = crown.trim() === '' ? null : parseFloat(crown);
  const valid = Number.isFinite(d) && d > 0;
  const res = valid ? modelPrice(d, Number.isFinite(h as number) ? h : null, Number.isFinite(c as number) ? c : null) : null;

  return (
    <div className="rounded-card border-2 border-bark/15 bg-white/70 p-5">
      <div className="flex flex-wrap items-end gap-5">
        <Field label="DBH" unit="in" value={dbh} onChange={setDbh} />
        <Field label="Height" unit="ft" value={height} onChange={setHeight} />
        <Field label="Crown spread" unit="ft" value={crown} onChange={setCrown} />
      </div>

      {res ? (
        <div className="mt-5 border-t border-bark/10 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wide text-fg-2">
                Suggested price
              </div>
              <div className="font-display text-4xl text-orange">{fmtUsd(res.price)}</div>
            </div>
            <div className="text-sm text-fg-2">
              {d}&quot; × {fmtUsd(res.ratePerInch)}/inch
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border-2 border-bark/20 px-3 py-1 text-ink">
              Base {fmtUsd(PRICING_MODEL.basePerInch)}/in
            </span>
            <span className={`rounded-full border-2 px-3 py-1 ${res.tall ? 'border-orange bg-orange/10 text-ink' : 'border-bark/15 text-fg-3'}`}>
              {res.tall ? '+' : ''}
              {fmtUsd(PRICING_MODEL.tallSurcharge)}/in tall {res.tall ? '(applied)' : `(>${PRICING_MODEL.tallThreshold}′ — no)`}
            </span>
            <span className={`rounded-full border-2 px-3 py-1 ${res.wide ? 'border-orange bg-orange/10 text-ink' : 'border-bark/15 text-fg-3'}`}>
              {res.wide ? '+' : ''}
              {fmtUsd(PRICING_MODEL.wideSurcharge)}/in wide {res.wide ? '(applied)' : `(>${PRICING_MODEL.wideThreshold}′ — no)`}
            </span>
          </div>
          {res.tall && res.wide && (
            <p className="mt-3 text-xs italic text-fg-3">
              Heads up: trees that are both tall and wide have historically run
              closer to $122/inch, so this modeled price is on the conservative
              side for a tree like this.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-fg-3">Enter a DBH to see a suggested price.</p>
      )}
    </div>
  );
}

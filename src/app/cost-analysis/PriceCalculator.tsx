'use client';

// ============================================================================
// Draft-price calculator. Enter DBH / height / crown; prices off the per-DBH-
// category pricing matrix. Pure client-side; nothing leaves the page.
// ============================================================================

import { useState } from 'react';
import { modelPriceMatrix } from '@/lib/pricing-matrix';
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

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border-2 px-3 py-1 ${on ? 'border-orange bg-orange/10 text-ink' : 'border-bark/15 text-fg-3'}`}>
      {children}
    </span>
  );
}

export function PriceCalculator() {
  const [dbh, setDbh] = useState('20');
  const [height, setHeight] = useState('40');
  const [crown, setCrown] = useState('20');

  // Round each entry to the nearest whole number (.4 and below down, .5 and up
  // up). The size/height/crown bands are whole-number ranges with gaps between
  // them (…61–70, then 71–80), so a decimal like 70.4 falls in no band and used
  // to grab the top band's surcharge — rounding first keeps every entry in a
  // real band. Math.round(NaN) stays NaN, so blank/garbage inputs behave as before.
  const d = Math.round(parseFloat(dbh));
  const h = height.trim() === '' ? null : Math.round(parseFloat(height));
  const c = crown.trim() === '' ? null : Math.round(parseFloat(crown));
  const valid = Number.isFinite(d) && d > 0;
  const res = valid ? modelPriceMatrix(d, h, c) : null;

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
              {d}&quot; × {fmtUsd(res.ratePerInch)}/inch &nbsp;·&nbsp; size {res.category.label}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Chip on={false}>Base {fmtUsd(res.base)}/in</Chip>
            <Chip on={res.heightMod !== 0}>
              Height {res.heightTierLabel ?? '—'}: {res.heightMod >= 0 ? '+' : ''}
              {fmtUsd(res.heightMod)}/in
            </Chip>
            <Chip on={res.canopyMod !== 0}>
              Canopy {res.canopyTierLabel ?? '—'}: {res.canopyMod >= 0 ? '+' : ''}
              {fmtUsd(res.canopyMod)}/in
            </Chip>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-fg-3">Enter a DBH to see a suggested price.</p>
      )}
    </div>
  );
}

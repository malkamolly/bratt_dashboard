'use client';

// ============================================================================
// ChartBars — the interactive bars on the Follow-Through Scorecard
// ============================================================================
// The page itself is a server component; these are the only parts that need
// browser events, so they live here behind a client boundary.
//
// Why not the native `title` attribute: it waits about a second, can't be
// styled, is invisible on touch, and never shows on keyboard focus — so the
// figures effectively weren't reachable. This gives every segment an instant
// styled readout on hover, tap, and focus.
//
// Tooltip content is passed as STRUCTURED props (heading / value / detail)
// rather than an HTML string, so nothing on this page needs
// dangerouslySetInnerHTML to get bold numbers.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SegmentTip = {
  heading: string;
  value: string;
  detail?: string;
};

export type BarSegment = {
  key: string;
  /** Share of this bar's own total, 0–1. */
  share: number;
  /** null renders the hatched "nothing happened" fill. */
  color: string | null;
  /** Printed inside the segment when it's wide enough to hold the text. */
  label: string;
  tip: SegmentTip;
};

const HATCH = 'repeating-linear-gradient(135deg, #F5EDDB 0 6px, #7A6B55 6px 7px)';

// The palest step of the call ramp needs dark ink on it; the rest take cream.
const PALE_STEP = '#CFA96C';

// ---------------------------------------------------------------------------
// One shared floating readout, portalled to <body> so no ancestor's overflow
// or stacking context can clip it.
// ---------------------------------------------------------------------------

function Readout({
  tip,
  x,
  y,
}: {
  tip: SegmentTip;
  x: number;
  y: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Measure, then place: flip left near the right edge, and below the cursor
  // when there isn't room above.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x + 14;
    let top = y - r.height - 12;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 20;
    setPos({ left, top });
  }, [x, y, tip]);

  return createPortal(
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-50 max-w-[260px] rounded-2 border-2 border-black bg-bark px-3 py-2 shadow-sh-2"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        // Hidden until measured so it never flashes in the wrong place.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <p className="font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-orange">
        {tip.heading}
      </p>
      <p className="mt-0.5 text-[13px] font-bold leading-snug text-cream">
        {tip.value}
      </p>
      {tip.detail && (
        <p className="mt-0.5 text-[12px] leading-snug text-sand-light">{tip.detail}</p>
      )}
    </div>,
    document.body,
  );
}

type Active = {
  tip: SegmentTip;
  x: number;
  y: number;
  /**
   * Set when the readout was opened by focus or a tap rather than the cursor.
   * Those readouts follow the ELEMENT: tabbing to an off-screen segment makes
   * the browser scroll it into view, and a scroll-hides-everything rule would
   * dismiss the readout the keypress just opened.
   */
  anchor: HTMLElement | null;
};

/** Shared hover/focus/tap wiring for anything that carries a readout. */
function useReadout() {
  const [active, setActive] = useState<Active | null>(null);

  const show = useCallback(
    (tip: SegmentTip, x: number, y: number, anchor: HTMLElement | null = null) => {
      setActive({ tip, x, y, anchor });
    },
    [],
  );
  const hide = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (!active) return;
    // A tap opens the readout; the next tap anywhere else closes it. Without
    // this it would stay stuck open on a phone.
    const onDocDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') hide();
    };
    // Cursor-anchored readouts are stale the moment the page moves under the
    // mouse; element-anchored ones just need repositioning.
    const onScroll = () => {
      setActive((cur) => {
        if (!cur) return cur;
        if (!cur.anchor) return null;
        const r = cur.anchor.getBoundingClientRect();
        return { ...cur, x: r.left + r.width / 2, y: r.top };
      });
    };
    document.addEventListener('pointerdown', onDocDown, { capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDocDown, { capture: true });
      window.removeEventListener('scroll', onScroll);
    };
  }, [active, hide]);

  const handlers = (tip: SegmentTip) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') show(tip, e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') show(tip, e.clientX, e.clientY);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        e.stopPropagation();
        const el = e.currentTarget as HTMLElement;
        const r = el.getBoundingClientRect();
        show(tip, r.left + r.width / 2, r.top, el);
      }
    },
    onFocus: (e: React.FocusEvent) => {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      show(tip, r.left + r.width / 2, r.top, el);
    },
    onBlur: hide,
  });

  return { active, handlers };
}

// ---------------------------------------------------------------------------

/**
 * A stacked bar of segments.
 *
 * @param scale shrinks the whole bar (the revenue chart uses it so bars compare
 *              in dollars); count charts leave it at 100 so each board fills the
 *              track and the MIX is what compares.
 */
export function StackedBar({
  segments,
  scale = 100,
  ariaLabel,
}: {
  segments: BarSegment[];
  scale?: number;
  ariaLabel: string;
}) {
  const { active, handlers } = useReadout();

  return (
    <>
      <div className="flex h-8 min-w-0 gap-[2px]" role="img" aria-label={ariaLabel}>
        {segments.map((s) => {
          const width = s.share * scale;
          return (
            <div
              key={s.key}
              tabIndex={0}
              aria-label={`${s.tip.heading}: ${s.tip.value}${s.tip.detail ? `. ${s.tip.detail}` : ''}`}
              {...handlers(s.tip)}
              className="relative flex cursor-default items-center justify-center overflow-hidden border border-ink transition-[filter] first:rounded-l-1 last:rounded-r-1 hover:brightness-110 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal motion-reduce:transition-none"
              style={{ flex: `0 0 ${width}%`, background: s.color ?? HATCH }}
            >
              {/* Only label a segment wide enough to hold the text; the readout
                  covers the rest. */}
              {width >= 9 && (
                <span
                  className="whitespace-nowrap px-1 font-headline text-[11px] font-black tabular-nums"
                  style={
                    s.color
                      ? { color: s.color === PALE_STEP ? '#1A0E05' : '#FFF8EC' }
                      : { color: '#4A3826', background: '#F5EDDB', borderRadius: 3 }
                  }
                >
                  {s.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {active && <Readout tip={active.tip} x={active.x} y={active.y} />}
    </>
  );
}

/**
 * A single-value bar (chart 2). `width` is a percentage of the track; pass
 * `empty` for the hatched "none" pill when there's nothing to show.
 */
export function SingleBar({
  width,
  tip,
  ariaLabel,
  empty = false,
}: {
  width: number;
  tip: SegmentTip;
  ariaLabel: string;
  empty?: boolean;
}) {
  const { active, handlers } = useReadout();

  return (
    <>
      <div className="flex h-8 min-w-0" role="img" aria-label={ariaLabel}>
        <div
          tabIndex={0}
          aria-label={`${tip.heading}: ${tip.value}`}
          {...handlers(tip)}
          className={`flex cursor-default items-center justify-center rounded-1 border border-ink transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal motion-reduce:transition-none ${
            empty ? '' : 'bg-orange'
          }`}
          style={
            empty
              ? { flex: '0 0 72px', background: HATCH }
              : { width: `${width}%`, minWidth: 6 }
          }
        >
          {empty && (
            <span
              className="px-1 font-headline text-[11px] font-black"
              style={{ color: '#4A3826', background: '#F5EDDB', borderRadius: 3 }}
            >
              none
            </span>
          )}
        </div>
      </div>
      {active && <Readout tip={active.tip} x={active.x} y={active.y} />}
    </>
  );
}

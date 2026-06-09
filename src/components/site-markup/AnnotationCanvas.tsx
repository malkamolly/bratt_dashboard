'use client';

// ============================================================================
// AnnotationCanvas
// ============================================================================
// A self-contained drawing surface. You hand it a background image (a map
// image or an uploaded photo) and it lets the user draw arrows, lines, boxes,
// freehand pen strokes, text labels, and auto-numbered markers (1, 2, 3…) on
// top, then export the whole thing (background + drawings) as a single
// flattened JPEG.
//
// How it works: we draw EVERYTHING onto one <canvas> — the background image
// first, then every shape on top. So exporting is just `canvas.toDataURL()`.
// Because the background image is same-origin (our own photo blob, or our
// /api/site-map proxy), the browser lets us export without complaint.
//
// We keep the shapes and the in-progress draft in refs (not React state) so
// dragging stays smooth — every pointer move just repaints the canvas
// directly instead of triggering a React re-render.
// ============================================================================

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export type AnnotationCanvasHandle = {
  /** Flattened image (background + drawings) as a JPEG data URL, or null if
   *  there's no background image loaded yet. */
  getDataUrl: () => string | null;
  /** Has the user drawn anything? */
  hasContent: () => boolean;
};

type Tool = 'pen' | 'arrow' | 'line' | 'box' | 'text' | 'number';
type SizeKey = 'S' | 'M' | 'L';

type Point = { x: number; y: number };

type Shape =
  | { kind: 'pen'; color: string; width: number; points: Point[] }
  | { kind: 'arrow' | 'line' | 'box'; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'text'; color: string; size: number; x: number; y: number; text: string }
  | { kind: 'number'; color: string; radius: number; x: number; y: number; value: number };

type Props = {
  /** Background image URL, or null to show an empty placeholder. */
  src: string | null;
  /** Placeholder text shown before an image is loaded. */
  placeholder?: string;
};

const COLORS = ['#DC2626', '#EB4C1B', '#FACC15', '#22C55E', '#2563EB', '#FFFFFF', '#111111'];

const TOOLS: { value: Tool; label: string; emoji: string }[] = [
  { value: 'arrow', label: 'Arrow', emoji: '↗' },
  { value: 'line', label: 'Line', emoji: '╱' },
  { value: 'box', label: 'Box', emoji: '▭' },
  { value: 'pen', label: 'Pen', emoji: '✎' },
  { value: 'text', label: 'Text', emoji: 'T' },
  { value: 'number', label: 'Numbered marker — taps drop 1, 2, 3…', emoji: '①' },
];

// Largest internal canvas width, to bound memory on big photos.
const MAX_CANVAS_W = 1280;

function strokePx(size: SizeKey, canvasW: number): number {
  const base = canvasW * 0.006;
  if (size === 'S') return Math.max(2, base * 0.6);
  if (size === 'L') return base * 1.9;
  return base;
}

function fontPx(size: SizeKey, canvasW: number): number {
  return strokePx(size, canvasW) * 5.5;
}

// Radius (in canvas pixels) of a numbered marker for each size button.
function circleRadiusPx(size: SizeKey, canvasW: number): number {
  const base = canvasW * 0.018;
  if (size === 'S') return base * 0.7;
  if (size === 'L') return base * 1.5;
  return base;
}

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(
  function AnnotationCanvas({ src, placeholder }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const shapesRef = useRef<Shape[]>([]);
    const draftRef = useRef<Shape | null>(null);
    const drawingRef = useRef(false);

    // Canvas pixel dimensions — drive the <canvas> width/height attributes.
    const [dims, setDims] = useState<{ w: number; h: number }>({ w: 1280, h: 960 });
    const [ready, setReady] = useState(false);

    const [tool, setTool] = useState<Tool>('arrow');
    const [color, setColor] = useState<string>(COLORS[0]);
    const [size, setSize] = useState<SizeKey>('M');

    // ---- Drawing -----------------------------------------------------------

    const drawShape = useCallback((ctx: CanvasRenderingContext2D, s: Shape) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.kind === 'text') {
        ctx.font = `bold ${s.size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = 'top';
        // White halo so the label stays readable over busy imagery.
        ctx.lineWidth = Math.max(2, s.size * 0.16);
        ctx.strokeStyle = s.color === '#FFFFFF' ? '#111111' : '#FFFFFF';
        ctx.strokeText(s.text, s.x, s.y);
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, s.x, s.y);
        return;
      }

      if (s.kind === 'number') {
        const r = s.radius;
        // Light fills (white / yellow) need dark ink for the ring + number.
        const lightFill = s.color === '#FFFFFF' || s.color === '#FACC15';
        const ink = lightFill ? '#111111' : '#FFFFFF';
        // Filled circle.
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        // Contrasting ring so the marker reads over busy imagery.
        ctx.lineWidth = Math.max(2, r * 0.12);
        ctx.strokeStyle = ink;
        ctx.stroke();
        // Number, centered inside (smaller font for two-digit values).
        const label = String(s.value);
        const fontSize = r * (label.length >= 2 ? 1.1 : 1.35);
        ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ink;
        ctx.fillText(label, s.x, s.y);
        // Reset alignment so later text labels aren't knocked off-position.
        ctx.textAlign = 'left';
        return;
      }

      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;

      if (s.kind === 'pen') {
        if (s.points.length < 2) {
          if (s.points.length === 1) {
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          return;
        }
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        ctx.stroke();
        return;
      }

      if (s.kind === 'box') {
        ctx.strokeRect(
          Math.min(s.x1, s.x2),
          Math.min(s.y1, s.y2),
          Math.abs(s.x2 - s.x1),
          Math.abs(s.y2 - s.y1),
        );
        return;
      }

      // line + arrow share the main stroke
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();

      if (s.kind === 'arrow') {
        const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        const head = s.width * 4 + 6;
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(
          s.x2 - head * Math.cos(angle - Math.PI / 6),
          s.y2 - head * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(
          s.x2 - head * Math.cos(angle + Math.PI / 6),
          s.y2 - head * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      }
    }, []);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Use the canvas's actual pixel size as the source of truth.
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#E8DCC0';
        ctx.fillRect(0, 0, w, h);
      }

      for (const s of shapesRef.current) drawShape(ctx, s);
      if (draftRef.current) drawShape(ctx, draftRef.current);
    }, [drawShape]);

    // ---- Load / change background image ------------------------------------

    useEffect(() => {
      if (!src) {
        imgRef.current = null;
        shapesRef.current = [];
        draftRef.current = null;
        setReady(false);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const scale = Math.min(1, MAX_CANVAS_W / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        imgRef.current = img;
        // A fresh background means previous drawings no longer line up.
        shapesRef.current = [];
        draftRef.current = null;
        // Resize via state. React re-applies the width/height attributes during
        // render, which BLANKS the canvas — so the actual painting must happen
        // afterwards, in the redraw effect below, not here.
        setDims({ w, h });
        setReady(true);
      };
      img.onerror = () => {
        imgRef.current = null;
        setReady(false);
      };
      img.src = src;
    }, [src]);

    // Repaint after the canvas resizes or readiness flips. This runs *after*
    // React has applied the (blanking) width/height attributes, so the image
    // and shapes survive a resize to a differently-shaped photo.
    useEffect(() => {
      redraw();
    }, [dims, ready, redraw]);

    // ---- Pointer handling --------------------------------------------------

    function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!ready) return;
      const p = canvasPoint(e);
      const w = canvasRef.current?.width ?? dims.w;

      if (tool === 'text') {
        const text = window.prompt('Label text')?.trim();
        if (text) {
          shapesRef.current.push({
            kind: 'text',
            color,
            size: fontPx(size, w),
            x: p.x,
            y: p.y,
            text,
          });
          redraw();
        }
        return;
      }

      if (tool === 'number') {
        // Auto-increment: each tap drops the next number in sequence so you
        // can mark tree 1, 2, 3… without retyping. Undo steps back through them.
        const value =
          shapesRef.current.filter((s) => s.kind === 'number').length + 1;
        shapesRef.current.push({
          kind: 'number',
          color,
          radius: circleRadiusPx(size, w),
          x: p.x,
          y: p.y,
          value,
        });
        redraw();
        return;
      }

      drawingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      const width = strokePx(size, w);
      draftRef.current =
        tool === 'pen'
          ? { kind: 'pen', color, width, points: [p] }
          : { kind: tool, color, width, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      redraw();
    }

    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current || !draftRef.current) return;
      const p = canvasPoint(e);
      const d = draftRef.current;
      if (d.kind === 'pen') {
        d.points.push(p);
      } else if (d.kind === 'arrow' || d.kind === 'line' || d.kind === 'box') {
        d.x2 = p.x;
        d.y2 = p.y;
      }
      redraw();
    }

    function endStroke() {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (draftRef.current) {
        shapesRef.current.push(draftRef.current);
        draftRef.current = null;
      }
      redraw();
    }

    function undo() {
      shapesRef.current.pop();
      redraw();
    }

    function clearAll() {
      if (shapesRef.current.length === 0) return;
      if (!window.confirm('Clear all markups on this image?')) return;
      shapesRef.current = [];
      redraw();
    }

    // ---- Imperative handle for the parent ----------------------------------

    useImperativeHandle(
      ref,
      () => ({
        getDataUrl: () => {
          const canvas = canvasRef.current;
          if (!canvas || !ready) return null;
          redraw();
          try {
            return canvas.toDataURL('image/jpeg', 0.92);
          } catch {
            return null;
          }
        },
        hasContent: () => shapesRef.current.length > 0,
      }),
      [ready, redraw],
    );

    // ---- UI ----------------------------------------------------------------

    return (
      <div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-t-card border-2 border-b-0 border-paper-edge bg-paper px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTool(t.value)}
                title={t.label}
                className={`h-8 w-8 rounded-md border-2 font-headline text-sm font-extrabold transition-colors ${
                  tool === t.value
                    ? 'border-orange bg-orange text-white'
                    : 'border-paper-edge bg-white text-fg-2 hover:border-orange'
                }`}
              >
                {t.emoji}
              </button>
            ))}
          </div>

          <span className="mx-1 h-6 w-px bg-paper-edge" />

          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                style={{ backgroundColor: c }}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  color === c ? 'scale-110 border-ink' : 'border-paper-edge'
                }`}
              />
            ))}
          </div>

          <span className="mx-1 h-6 w-px bg-paper-edge" />

          <div className="flex gap-1">
            {(['S', 'M', 'L'] as SizeKey[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={`h-8 w-8 rounded-md border-2 font-headline text-xs font-extrabold transition-colors ${
                  size === s
                    ? 'border-orange bg-orange text-white'
                    : 'border-paper-edge bg-white text-fg-2 hover:border-orange'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <span className="mx-1 h-6 w-px bg-paper-edge" />

          <button
            type="button"
            onClick={undo}
            className="rounded-md border-2 border-paper-edge bg-white px-3 py-1.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 transition-colors hover:border-orange hover:text-orange"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border-2 border-paper-edge bg-white px-3 py-1.5 font-headline text-[11px] font-extrabold uppercase tracking-ribbon text-fg-2 transition-colors hover:border-orange-press hover:text-orange-press"
          >
            Clear
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={dims.w}
          height={dims.h}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
          style={{ touchAction: 'none', cursor: ready ? 'crosshair' : 'default' }}
          className="block w-full rounded-b-card border-2 border-paper-edge bg-bone"
        />
        {!ready && placeholder && (
          <p className="mt-2 text-center text-sm text-fg-3">{placeholder}</p>
        )}
      </div>
    );
  },
);

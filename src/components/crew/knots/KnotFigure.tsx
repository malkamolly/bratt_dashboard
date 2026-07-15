// ============================================================================
// KnotFigure — original, hand-drawn SVG diagrams for the Knot Library
// ============================================================================
// Each knot in src/lib/knots.ts has a set of ordered steps; every step names a
// `frame` index that this component draws. The artwork is ALL original — we do
// not copy photos or animations from AnimatedKnots.com (copyrighted).
//
// Two-tone convention (see <KnotLegend> for the on-page key):
//   • ORANGE = the working end — the part of the rope you are moving.
//   • BLUE   = the standing part — the fixed / load-bearing side.
// Colouring the moving strand differently lets you follow the action from one
// step to the next. (The girth hitch is tied in a closed sling, which has no
// distinct working end, so it's drawn all in orange.)
//
// How the "over / under" look works: a rope strand is a wide panel-coloured
// "casing" with a narrower coloured core on top. Strands are painted
// back-to-front, so a later strand's casing erases the core of any strand it
// crosses — making it read as passing OVER. Draw the under-strand first.
//
// Pure SVG, no interactivity, so this is a server component.
// ============================================================================

const PANEL = '#F4EAD5'; // warm paper — also the rope "casing" colour
const BARK = '#4A3418';
const BARK_EDGE = '#33240F';
const BARK_LINE = '#5E4522';
const W_CORE = '#E4791F'; // working end — orange
const W_HI = '#F6AC5B';
const S_CORE = '#356F86'; // standing part — steel blue
const S_HI = '#6BA2B6';
const ACCENT = '#5F7D18'; // lime-olive — motion arrows

// --- rope primitive ---------------------------------------------------------
function Strand({ d, tone }: { d: string; tone: 'work' | 'stand' }) {
  const core = tone === 'work' ? W_CORE : S_CORE;
  const hi = tone === 'work' ? W_HI : S_HI;
  return (
    <>
      <path d={d} fill="none" stroke={PANEL} strokeWidth={27} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={core} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={hi} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </>
  );
}
// Shorthands: W = working end (orange), S = standing part (blue).
const W = (d: string) => <Strand d={d} tone="work" />;
const S = (d: string) => <Strand d={d} tone="stand" />;

// --- anchors ----------------------------------------------------------------
function HBranch({ y, h }: { y: number; h: number }) {
  return (
    <g>
      <rect x={-2} y={y} width={264} height={h} fill={BARK} />
      <rect x={-2} y={y} width={264} height={4} fill={BARK_EDGE} />
      <rect x={-2} y={y + h - 4} width={264} height={4} fill={BARK_EDGE} />
      <line x1={-2} y1={y + h * 0.5} x2={262} y2={y + h * 0.5} stroke={BARK_LINE} strokeWidth={2} opacity={0.5} />
    </g>
  );
}
function VPost({ x, w }: { x: number; w: number }) {
  return (
    <g>
      <rect x={x} y={-2} width={w} height={264} fill={BARK} />
      <rect x={x} y={-2} width={4} height={264} fill={BARK_EDGE} />
      <rect x={x + w - 4} y={-2} width={4} height={264} fill={BARK_EDGE} />
      <line x1={x + w * 0.5} y1={-2} x2={x + w * 0.5} y2={262} stroke={BARK_LINE} strokeWidth={2} opacity={0.5} />
    </g>
  );
}
function Log({ y, h }: { y: number; h: number }) {
  return (
    <g>
      <rect x={-2} y={y} width={264} height={h} rx={12} fill={BARK} />
      <ellipse cx={238} cy={y + h / 2} rx={13} ry={h / 2 - 3} fill={BARK_EDGE} opacity={0.5} />
    </g>
  );
}
function Arrow({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={ACCENT}
      strokeWidth={5.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd="url(#knot-arrow)"
    />
  );
}

// ============================================================================
// Per-knot frame renderers. Each returns the artwork for one step.
// ============================================================================

function girthHitch(frame: number) {
  const branch = <HBranch y={38} h={40} />;
  if (frame === 1) {
    return (
      <>
        {W('M108 78 L108 34 Q108 20 122 20 L148 20 Q162 20 162 34 L162 78')}
        {branch}
        {W('M108 78 L108 200 Q108 216 124 216 L146 216 Q162 216 162 200 L162 78')}
        <Arrow d="M198 58 Q198 88 176 94" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        {W('M104 78 L104 30 Q104 18 118 18 L152 18 Q166 18 166 30 L166 44')}
        {branch}
        {W('M120 206 Q114 140 124 92 L130 44')}
        {W('M150 206 Q156 140 146 92 L140 44')}
        <Arrow d="M135 124 L135 70" />
      </>
    );
  }
  return (
    <>
      {W('M122 78 L122 54 Q122 48 135 48 Q148 48 148 54 L148 78')}
      {branch}
      {W('M122 78 L122 200 Q122 215 135 215 Q148 215 148 200 L148 78')}
    </>
  );
}

function cloveHitch(frame: number) {
  const post = <VPost x={158} w={52} />;
  if (frame === 1) {
    return (
      <>
        {S('M150 150 L150 214')}
        {W('M150 150 L222 150')}
        {post}
        {W('M214 150 L150 108')}
        <Arrow d="M150 128 Q184 120 210 138" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        {S('M150 150 L150 214')}
        {W('M150 150 L222 150')}
        {W('M150 108 L222 108')}
        {post}
        {W('M214 150 L176 132')}
        {W('M214 108 L150 150')}
        <Arrow d="M150 172 Q132 188 116 194" />
      </>
    );
  }
  return (
    <>
      {S('M150 150 L150 216')}
      {W('M150 150 L222 150')}
      {W('M150 106 L222 106')}
      {post}
      {W('M214 150 L166 120')}
      {W('M214 106 L150 150')}
      {W('M150 106 L134 92')}
    </>
  );
}

function timberHitch(frame: number) {
  const log = <Log y={158} h={72} />;
  if (frame === 1) {
    return (
      <>
        {S('M68 158 L68 128 L150 128')}
        {log}
        {S('M68 158 L68 216')}
        {W('M150 128 Q116 126 98 142')}
        <Arrow d="M186 120 L120 128" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        {S('M70 158 L70 124 L150 124')}
        {log}
        {S('M70 158 L70 216')}
        {W('M150 124 Q112 122 96 138')}
        {W('M96 138 Q78 148 96 156')}
        {W('M96 156 Q114 164 96 172')}
        {W('M96 172 Q80 180 96 186')}
        <Arrow d="M150 150 Q128 168 110 178" />
      </>
    );
  }
  return (
    <>
      {S('M78 158 L78 124 L138 124')}
      {log}
      {S('M78 158 L78 220')}
      {W('M138 124 Q110 122 96 136')}
      {W('M96 136 Q80 146 96 154')}
      {W('M96 154 Q112 162 96 170')}
      {W('M96 170 Q82 178 96 184')}
      <Arrow d="M78 196 L78 232" />
    </>
  );
}

function runningBowline(frame: number) {
  const branch = <HBranch y={30} h={34} />;
  const limbWrap = W('M150 62 L150 28 Q150 16 162 16 L188 16 Q200 16 200 28 L200 62');
  if (frame === 1) {
    return (
      <>
        {limbWrap}
        {branch}
        {S('M92 62 L92 216')}
        {W('M150 62 Q150 104 122 116')}
        {W('M122 116 Q98 126 92 148')}
        {W('M92 148 Q86 172 108 176 Q128 178 124 154')}
        {W('M124 154 L150 148')}
        <Arrow d="M150 148 L130 153" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        {limbWrap}
        {branch}
        {S('M92 62 L92 216')}
        {W('M92 178 Q80 158 98 150 Q118 144 122 164')}
        {W('M122 164 L122 108 Q122 90 150 82')}
        <Arrow d="M122 150 L122 104" />
      </>
    );
  }
  if (frame === 3) {
    return (
      <>
        {limbWrap}
        {branch}
        {S('M92 62 L92 216')}
        {W('M92 180 Q78 162 96 154 Q116 148 120 168')}
        {W('M120 168 L120 116')}
        {W('M120 116 Q120 96 96 92 Q70 90 70 116')}
        {W('M70 116 Q70 140 94 144')}
        <Arrow d="M112 150 L96 146" />
      </>
    );
  }
  return (
    <>
      {W('M150 62 L150 30 Q150 20 160 20 L182 20 Q192 20 192 30 L192 62')}
      {branch}
      {W('M150 62 Q150 88 130 96 Q108 104 118 122 Q126 136 148 128')}
      {W('M148 128 L148 100')}
      {S('M192 62 L192 216')}
      <Arrow d="M192 182 L192 226" />
    </>
  );
}

const RENDERERS: Record<string, (frame: number) => React.ReactNode> = {
  'girth-hitch': girthHitch,
  'clove-hitch': cloveHitch,
  'timber-hitch': timberHitch,
  'running-bowline': runningBowline,
};

export function KnotFigure({
  slug,
  frame,
  className,
}: {
  slug: string;
  frame: number;
  className?: string;
}) {
  const render = RENDERERS[slug];
  return (
    <svg
      viewBox="0 0 260 260"
      role="img"
      aria-label={`${slug.replace(/-/g, ' ')} — step ${frame}`}
      className={className}
    >
      <defs>
        <marker
          id="knot-arrow"
          viewBox="0 0 10 10"
          refX={7}
          refY={5}
          markerWidth={5}
          markerHeight={5}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={ACCENT} />
        </marker>
      </defs>
      <rect x={4} y={4} width={252} height={252} rx={18} fill={PANEL} />
      {render ? render(frame) : null}
    </svg>
  );
}

// Small colour key shown once per knot page, above the steps.
export function KnotLegend({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-2 ${className ?? ''}`}>
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-2.5 w-6 rounded-full" style={{ background: W_CORE }} />
        Working end <span className="text-fg-3">(the part you move)</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-2.5 w-6 rounded-full" style={{ background: S_CORE }} />
        Standing part <span className="text-fg-3">(the fixed side)</span>
      </span>
    </div>
  );
}

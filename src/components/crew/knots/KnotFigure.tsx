// ============================================================================
// KnotFigure — original, hand-drawn SVG diagrams for the Knot Library
// ============================================================================
// Each knot in src/lib/knots.ts has a set of ordered steps; every step names a
// `frame` index that this component draws. The artwork is ALL original — we do
// not copy photos or animations from AnimatedKnots.com (copyrighted).
//
// How the "over / under" look works:
//   A rope strand is drawn as two stacked paths — a wide "casing" the color of
//   the panel background, then a narrower colored "core" on top. Strands are
//   painted back-to-front, so a later strand's casing erases the core of any
//   strand it crosses, making it read as passing OVER. Draw the strand you
//   want UNDERNEATH first.
//
// Pure SVG, no interactivity, so this is a server component.
// ============================================================================

const PANEL = '#F4EAD5'; // warm paper — also the rope "casing" color
const BARK = '#4A3418';
const BARK_EDGE = '#33240F';
const BARK_LINE = '#5E4522';
const ROPE = '#C8692B'; // brand-orange rope core
const ROPE_HI = '#E08A4A'; // highlight down the middle of the rope
const ACCENT = '#6E7F27'; // lime-olive — arrows / motion cues

// --- rope primitive ---------------------------------------------------------
function Rope({ d }: { d: string }) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={PANEL}
        strokeWidth={26}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={ROPE}
        strokeWidth={17}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={ROPE_HI}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.75}
      />
    </>
  );
}

// --- anchors ----------------------------------------------------------------
function HBranch({ y, h }: { y: number; h: number }) {
  return (
    <g>
      <rect x={-2} y={y} width={244} height={h} fill={BARK} />
      <rect x={-2} y={y} width={244} height={4} fill={BARK_EDGE} />
      <rect x={-2} y={y + h - 4} width={244} height={4} fill={BARK_EDGE} />
      <line x1={-2} y1={y + h * 0.4} x2={242} y2={y + h * 0.4} stroke={BARK_LINE} strokeWidth={2} opacity={0.6} />
    </g>
  );
}

function VPost({ x, w }: { x: number; w: number }) {
  return (
    <g>
      <rect x={x} y={-2} width={w} height={244} fill={BARK} />
      <rect x={x} y={-2} width={4} height={244} fill={BARK_EDGE} />
      <rect x={x + w - 4} y={-2} width={4} height={244} fill={BARK_EDGE} />
      <line x1={x + w * 0.42} y1={-2} x2={x + w * 0.42} y2={242} stroke={BARK_LINE} strokeWidth={2} opacity={0.6} />
    </g>
  );
}

function Log({ y, h }: { y: number; h: number }) {
  return (
    <g>
      <rect x={-2} y={y} width={244} height={h} rx={10} fill={BARK} />
      <rect x={-2} y={y} width={244} height={4} fill={BARK_EDGE} opacity={0.6} />
      <ellipse cx={222} cy={y + h / 2} rx={12} ry={h / 2 - 3} fill={BARK_EDGE} opacity={0.5} />
    </g>
  );
}

function Arrow({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={ACCENT}
      strokeWidth={5}
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
  const branch = <HBranch y={30} h={38} />;
  if (frame === 1) {
    return (
      <>
        {/* bight poking up BEHIND the branch (drawn first → branch covers it) */}
        <Rope d="M100 68 L100 22 Q100 12 110 12 L130 12 Q140 12 140 22 L140 68" />
        {branch}
        {/* sling body hanging in FRONT */}
        <Rope d="M100 68 L100 198 Q100 214 116 214 L124 214 Q140 214 140 198 L140 68" />
        <Arrow d="M170 40 Q170 60 152 60" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        {/* the bight, still behind */}
        <Rope d="M96 68 L96 26 Q96 14 110 14 L130 14 Q144 14 144 26 L144 40" />
        {branch}
        {/* body lifted UP and fed through the bight opening */}
        <Rope d="M108 200 Q104 120 112 78 L116 40" />
        <Rope d="M132 200 Q136 120 128 78 L124 40" />
        <Arrow d="M120 96 L120 60" />
      </>
    );
  }
  // frame 3 — cinched collar
  return (
    <>
      {/* the wrap going up and over the branch (behind it) */}
      <Rope d="M108 66 Q108 38 120 38 Q132 38 132 66" />
      {branch}
      {/* the choke: a bight just under the branch that the legs pass through */}
      <Rope d="M98 84 Q120 100 142 84" />
      {/* doubled sling legs emerging from the choke and hanging down */}
      <Rope d="M112 84 L112 196 Q112 214 120 214" />
      <Rope d="M128 84 L128 196 Q128 214 120 214" />
    </>
  );
}

function cloveHitch(frame: number) {
  const post = <VPost x={150} w={54} />;
  if (frame === 1) {
    return (
      <>
        {/* first turn passes BEHIND the post */}
        <Rope d="M120 150 L214 150" />
        {post}
        {/* working end crosses over the front, up to the left */}
        <Rope d="M204 150 L120 108" />
        {/* standing part hangs down-left */}
        <Rope d="M120 150 L120 214" />
        <Arrow d="M150 96 Q170 92 196 104" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        {/* turn one (behind) */}
        <Rope d="M120 150 L214 150" />
        {/* turn two (behind, higher) */}
        <Rope d="M120 108 L214 108" />
        {post}
        {/* front diagonal of turn one */}
        <Rope d="M204 150 L166 132" />
        {/* working end tucks UNDER the diagonal, then out */}
        <Rope d="M204 108 L120 150" />
        <Rope d="M120 150 L120 214" />
        <Arrow d="M150 176 Q136 190 120 196" />
      </>
    );
  }
  // frame 3 — dressed
  return (
    <>
      <Rope d="M120 150 L214 150" />
      <Rope d="M120 110 L214 110" />
      {post}
      {/* the two crossing diagonals on the front (the finished X) */}
      <Rope d="M204 150 L156 118" />
      <Rope d="M204 110 L120 150" />
      <Rope d="M120 150 L120 216" />
      <Rope d="M120 110 L96 96" />
    </>
  );
}

function timberHitch(frame: number) {
  const log = <Log y={150} h={70} />;
  if (frame === 1) {
    return (
      <>
        {/* around the log (behind), back across the standing part */}
        <Rope d="M70 150 L70 120 L170 120" />
        {log}
        <Rope d="M70 150 L70 210" />
        {/* working end brought back across toward the standing part */}
        <Rope d="M170 120 Q120 118 96 138" />
        <Arrow d="M150 96 L96 118" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        <Rope d="M70 150 L70 118 L150 118" />
        {log}
        <Rope d="M70 150 L70 210" />
        {/* the working end twisted around its own bight several times */}
        <Rope d="M150 118 Q120 116 100 132" />
        <Rope d="M100 132 Q86 142 100 150" />
        <Rope d="M100 150 Q116 156 108 168" />
        <Rope d="M108 168 Q100 178 112 184" />
        <Arrow d="M150 150 Q135 168 120 178" />
      </>
    );
  }
  // frame 3 — snugged and loaded
  return (
    <>
      <Rope d="M78 150 L78 116 L138 116" />
      {log}
      <Rope d="M78 150 L78 214" />
      <Rope d="M138 116 Q108 114 92 128" />
      <Rope d="M92 128 Q80 138 92 146" />
      <Rope d="M92 146 Q106 150 98 160" />
      <Rope d="M98 160 Q90 168 100 172" />
      <Arrow d="M78 200 L78 226" />
    </>
  );
}

function runningBowline(frame: number) {
  const branch = <HBranch y={26} h={34} />;
  if (frame === 1) {
    return (
      <>
        {/* around the limb (behind) */}
        <Rope d="M150 60 L150 22 Q150 12 160 12 L182 12 Q192 12 192 22 L192 60" />
        {branch}
        {/* standing part down the left; working end laid across it */}
        <Rope d="M96 60 L96 214" />
        <Rope d="M150 60 Q140 96 118 118 L96 130" />
        <Rope d="M192 60 L192 96" />
        <Arrow d="M150 150 L108 138" />
      </>
    );
  }
  if (frame === 2) {
    return (
      <>
        <Rope d="M150 60 L150 22 Q150 12 160 12 L182 12 Q192 12 192 22 L192 60 L192 96" />
        {branch}
        {/* small overhand loop in the standing part */}
        <Rope d="M96 60 L96 150" />
        {/* the loop: standing part crosses over itself */}
        <Rope d="M96 150 Q80 168 96 182 Q116 196 128 172" />
        {/* working end brought UP through the loop */}
        <Rope d="M128 172 L128 120 Q128 104 150 96" />
        <Arrow d="M128 150 L128 116" />
      </>
    );
  }
  if (frame === 3) {
    return (
      <>
        <Rope d="M150 60 L150 22 Q150 12 160 12 L182 12 Q192 12 192 22 L192 60 L192 90" />
        {branch}
        <Rope d="M96 60 L96 150" />
        {/* the loop */}
        <Rope d="M96 150 Q80 170 98 184 Q120 196 130 170" />
        {/* working end: up through loop, around behind standing part, back down through */}
        <Rope d="M130 170 L130 112" />
        <Rope d="M130 112 Q130 96 112 92 Q88 88 84 108" />
        <Rope d="M84 108 Q82 132 104 138" />
        <Arrow d="M150 160 L124 152" />
      </>
    );
  }
  // frame 4 — noose runs down and chokes the limb
  return (
    <>
      {/* the bowline sits up near the limb, small and dressed */}
      <Rope d="M150 60 L150 26 Q150 16 160 16 L180 16 Q190 16 190 26 L190 60" />
      {branch}
      {/* choking loop cinched around... shown as a tight collar high, tail down */}
      <Rope d="M150 60 Q150 84 132 92 Q112 100 120 116 Q126 128 146 122" />
      <Rope d="M146 122 L146 96" />
      {/* standing part being pulled — the running line */}
      <Rope d="M190 60 L190 214" />
      <Arrow d="M190 176 L190 226" />
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
      viewBox="0 0 240 240"
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
      <rect x={4} y={4} width={232} height={232} rx={18} fill={PANEL} />
      {render ? render(frame) : null}
    </svg>
  );
}

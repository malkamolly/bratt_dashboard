// ============================================================================
// Knot library data — /crew/knots
// ============================================================================
// Reference content for the field-crew Knot Library. Each knot is defined here
// as plain data (name, what it's for, how to tie it, what to watch for). The
// step-by-step DIAGRAMS are drawn in code by the <KnotFigure> component
// (src/components/crew/knots/KnotFigure.tsx) — each step's `frame` index maps
// to a hand-drawn SVG there.
//
// Why data-in-code (not a .txt deck like training modules): a knot reference
// is something crews look up on their phone in the field, not a classroom
// slideshow. Keeping it as typed data lets the library page and the eventual
// training module both read from one source of truth.
//
// All artwork is original (drawn by us). We deliberately do NOT copy photos or
// animations from AnimatedKnots.com or any other source — those are
// copyrighted.
// ============================================================================

export type KnotStep = {
  /** One-line instruction for this step. */
  caption: string;
  /**
   * Index of the SVG frame to draw for this step. Frames live in KnotFigure,
   * keyed by (knot slug, frame). Steps and frames are 1:1 and in order.
   */
  frame: number;
};

export type Knot = {
  slug: string;
  name: string;
  /** Other names crews might know it by. */
  alsoCalled?: string[];
  /** Short one-liner shown on the library card. */
  tagline: string;
  /** A longer plain-language description of the knot and where it shines. */
  summary: string;
  /** What the crew actually uses it for on a job. */
  usedFor: string[];
  /** Safety / failure notes — the "don't get hurt" column. */
  watchOut: string[];
  /** Ordered how-to steps. */
  steps: KnotStep[];
  /** Rough tying difficulty, for the card badge. */
  difficulty: 'Core' | 'Everyday' | 'Advanced';
};

export const KNOTS: Knot[] = [
  {
    slug: 'girth-hitch',
    name: 'Girth Hitch',
    alsoCalled: ['Cow hitch', "Lark's foot", 'Lanyard hitch'],
    tagline: 'Fast way to attach a sling or loop to a branch or anchor.',
    summary:
      'The girth hitch attaches a closed loop (a sling, a runner, or a spliced eye) to a branch, spar, or ring. You fold the loop into a bight, pass it around the anchor, then feed the rest of the loop through that bight and cinch it down. It is the quickest way to "choke" a sling onto something round.',
    usedFor: [
      'Choking a sling around a branch to hang a block or pulley',
      'Attaching a loop runner to an anchor point',
      'Girth-hitching a tool lanyard to a harness ring',
    ],
    watchOut: [
      'A girth hitch can reduce a sling’s rated strength by roughly a third — derate accordingly on rigging loads.',
      'Dress it flat: crossed or twisted webbing loses even more strength.',
      'It grips by squeezing the anchor. On a slick or tapering branch it can slide — back it up or move to a fork if the load matters.',
    ],
    difficulty: 'Core',
    steps: [
      { caption: 'Pass a bight (a fold) of the sling up behind the branch so it pokes out above.', frame: 1 },
      { caption: 'Bring the rest of the sling — the hanging loop — up and pass it through that bight.', frame: 2 },
      { caption: 'Pull the hanging loop down and dress the wraps flat. It cinches into a tidy collar around the branch.', frame: 3 },
    ],
  },
  {
    slug: 'clove-hitch',
    name: 'Clove Hitch',
    alsoCalled: ['Double hitch'],
    tagline: 'Quick, adjustable hitch for tying a rope onto a spar or post.',
    summary:
      'The clove hitch is two wrapping turns where the rope crosses over itself, locking the line to a round object. It is fast to tie and easy to adjust, which makes it a go-to for starting a lashing or temporarily securing a line to a branch. It is not fully secure on its own under a heavy or shifting load, so it is usually backed up.',
    usedFor: [
      'Starting point for tying a rigging line onto a spar',
      'Temporarily securing a line to a rail, post, or branch',
      'The first hitch of a lashing',
    ],
    watchOut: [
      'It can work loose under a load that pulses or rotates — always back it up with a half hitch or two on rigging.',
      'On a tapering branch it can roll off the small end. Set it where the diameter is steady.',
      'Not a life-support knot on its own.',
    ],
    difficulty: 'Core',
    steps: [
      { caption: 'Take one turn around the spar, crossing the working end over the standing part.', frame: 1 },
      { caption: 'Take a second turn above the first, then tuck the working end under that last crossing turn.', frame: 2 },
      { caption: 'Pull both ends tight. The two turns pinch the crossing flat against the spar.', frame: 3 },
    ],
  },
  {
    slug: 'timber-hitch',
    name: 'Timber Hitch',
    tagline: 'Grips a log or limb to drag or hoist it — and unties easily after.',
    summary:
      'The timber hitch wraps the rope around a log and then twists the working end back around itself several times. Under tension it grips hard; once the load comes off, it falls apart in your hand. That combination — holds under load, releases instantly after — is why it is the classic knot for dragging brush and hoisting limbs.',
    usedFor: [
      'Attaching a line to drag a log or brush pile',
      'The anchor end of a rigging line around a limb (often paired with a half hitch near the cut for control)',
      'Any pull where you want an easy release afterward',
    ],
    watchOut: [
      'It only holds while there is tension on it. Keep the line loaded until the piece is where you want it.',
      'Use at least three tucks/twists (more on slick bark) so it can bite.',
      'Add a half hitch further along the log to keep a hoisted piece from swinging.',
    ],
    difficulty: 'Everyday',
    steps: [
      { caption: 'Pass the working end around the log and back across the standing part.', frame: 1 },
      { caption: 'Twist the working end around its own bight three or more times, tucking with the lay.', frame: 2 },
      { caption: 'Slide the twists snug against the log and load the standing part. Tension locks it.', frame: 3 },
    ],
  },
  {
    slug: 'running-bowline',
    name: 'Running Bowline',
    alsoCalled: ['Slip bowline'],
    tagline: 'The arborist rigging standard — a self-tightening loop you can set from the ground.',
    summary:
      'A running bowline is a bowline tied around its own standing part, so the fixed loop becomes a noose that slides closed around a limb. You can toss it over a branch, pull, and it cinches itself tight — no climbing out to dress it. Because it is built on a bowline, it stays strong and unties cleanly even after taking a heavy rigging load.',
    usedFor: [
      'Setting a rigging line around a limb from the ground',
      'Choking onto the piece being lowered so the line self-tightens',
      'Any rigging attachment where you want a secure, cinching loop that unties afterward',
    ],
    watchOut: [
      'Leave a generous tail out of the bowline — at least a fist’s length — so it can’t creep loose.',
      'It cinches hard: keep hands clear of the closing loop when the load comes on.',
      'Set the noose above a fork or nub when you can, so it can’t slide off the end of the limb.',
    ],
    difficulty: 'Advanced',
    steps: [
      { caption: 'Pass the working end around the limb, then lay it across the standing part.', frame: 1 },
      { caption: 'Make a small overhand loop in the standing part and bring the working end up through it.', frame: 2 },
      { caption: 'Take the working end around behind the standing part and back down through the same loop — that is the bowline.', frame: 3 },
      { caption: 'Tighten the bowline, then pull the standing part: the fixed loop runs down and chokes the limb.', frame: 4 },
    ],
  },
];

export function getKnot(slug: string): Knot | undefined {
  return KNOTS.find((k) => k.slug === slug);
}

// ============================================================================
// Knot library data — /crew/knots
// ============================================================================
// Reference content for the field-crew Knot Library. Each knot is defined here
// as plain data (name, what it's for, how to tie it, what to watch for).
//
// Knots are genuinely hard to learn from static pictures — the thing that
// teaches a knot is watching it tied in motion. So each knot links out to its
// animated, step-by-step tutorial on AnimatedKnots.com (linking is fine; it's
// copying their images that isn't). The written steps below are a quick
// on-the-truck reference to go with the animation.
//
// Why data-in-code (not a .txt deck like training modules): a knot reference
// is something crews look up on their phone in the field, not a classroom
// slideshow. Keeping it as typed data lets the library page and the training
// module both read from one source of truth.
// ============================================================================

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
  /** Ordered how-to steps — a quick text reference to go with the animation. */
  steps: string[];
  /** Link to the animated, step-by-step tutorial on AnimatedKnots.com. */
  animationUrl: string;
  /** YouTube video ID for the embedded/pop-up tutorial. */
  videoId: string;
  /** Who made the video — shown as a credit under the embed. */
  videoCredit: string;
  /** Rough tying difficulty, for the card badge. */
  difficulty: 'Core' | 'Everyday' | 'Advanced';
};

export const KNOTS: Knot[] = [
  {
    slug: 'girth-hitch',
    name: 'Girth Hitch',
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
    animationUrl: 'https://www.animatedknots.com/girth-hitch-knot',
    videoId: 'xuEhH44QV14',
    videoCredit: 'Russell Tree Experts',
    steps: [
      'Pass a bight (a fold) of the sling up behind the branch so it pokes out above.',
      'Bring the rest of the sling — the hanging loop — up and pass it through that bight.',
      'Pull the hanging loop down and dress the wraps flat. It cinches into a tidy collar around the branch.',
    ],
  },
  {
    slug: 'timber-hitch',
    name: 'Timber Hitch',
    tagline: 'A fallback attachment that grips under tension and unties easily once slack.',
    summary:
      'The timber hitch wraps the rope around a limb or log, then twists the working end back around itself several times. Under tension it grips hard; the moment the load comes off, it falls apart in your hand. At Bratt Tree the cow hitch is the first choice for attaching to a limb — reach for the timber hitch only when a sling is too short to tie a cow hitch.',
    usedFor: [
      'Only when a sling is not long enough to tie a cow hitch — the cow hitch is the first choice',
      'Attaching a rigging line directly around a limb or log',
    ],
    watchOut: [
      'It only holds while there is tension on it. Keep the line loaded until the piece is where you want it.',
      'Use at least five twists (more on slick bark) so it can bite.',
    ],
    difficulty: 'Everyday',
    animationUrl: 'https://www.animatedknots.com/timber-hitch-knot',
    videoId: 'm7HwD2YHvC0',
    videoCredit: '',
    steps: [
      'Pass the working end around the limb and back across the standing part.',
      'Twist the working end around its own bight five or more times, tucking with the lay.',
      'Slide the twists snug against the limb and load the standing part. Tension locks it.',
    ],
  },
  {
    slug: 'running-bowline',
    name: 'Running Bowline',
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
    animationUrl: 'https://www.animatedknots.com/running-bowline-knot',
    videoId: 'GejlCNssToA',
    videoCredit: 'Russell Tree Experts',
    steps: [
      'Pass the working end around the limb, then lay it across the standing part.',
      'Make a small overhand loop in the standing part and bring the working end up through it.',
      'Take the working end around behind the standing part and back down through the same loop — that is the bowline.',
      'Tighten the bowline, then pull the standing part: the fixed loop runs down and chokes the limb.',
    ],
  },
];

export function getKnot(slug: string): Knot | undefined {
  return KNOTS.find((k) => k.slug === slug);
}

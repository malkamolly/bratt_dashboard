// ============================================================================
// Plant Health Program — branding for the partner hub (/partner)
// ============================================================================
// This hub is CO-branded: it belongs to our landscaping partner (Landscapes
// Unlimited), delivered by Bratt Tree. So their name leads, ours appears as the
// service provider, and none of our internal chrome (mascot, orange, hub nav)
// shows up. One place to change all of it.
// ============================================================================

export const PROGRAM = {
  /** The program's name. Appears in the header, the tab title, and on every PDF. */
  name: 'Plant Health Program',
  tagline: 'Tree health proposals',
} as const;

export const PARTNER = {
  /** The partner company, as they write it. */
  name: 'Landscapes Unlimited',
  /**
   * Their logo, served from /public. DROP THE FILE HERE and it appears
   * automatically; until then the header falls back to a styled wordmark, so
   * nothing looks broken.
   *
   * Prefer an SVG (crisp at any size, tiny) or a PNG at least 600px wide with a
   * transparent background.
   */
  logo: '/brand/partners/landscapes-unlimited.svg',
  /** Fallback if the SVG isn't there. Same deal — optional. */
  logoFallback: '/brand/partners/landscapes-unlimited.png',
} as const;

// Their brand greens, read off the logo they supplied: a deep forest green for
// type, and the bright apple green from the leaf mark for accents. These were
// eyeballed from the image rather than taken from a brand guide — if they send
// real hex values or a style guide, correct them here and the whole hub follows.
export const PARTNER_COLORS = {
  /** Wordmark green — headings, buttons, links. */
  dark: '#0B6136',
  /** Deeper still, for hover/pressed states. */
  darker: '#084727',
  /** The apple green from the leaf mark — accents and highlights only. Too
   *  light for text on white (fails contrast), so never use it for body copy. */
  accent: '#8DC63F',
} as const;

export const BRATT = {
  /** Shown as the service provider, not as the hub's owner. */
  name: 'Bratt Tree Company',
  /** Who the partner contacts about pricing or an unusual tree. */
  contactName: 'Connor',
  contactEmail: 'connor@bratttree.com',
} as const;

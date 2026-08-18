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
   * Their logo, served from /public. Upload the file here and it appears
   * automatically — no code change:
   *
   *   https://github.com/malkamolly/bratt_dashboard/upload/main/public/brand/partners
   *
   * Every name below is tried in order, so an .svg, .png, .jpg or .webp all
   * work. Prefer SVG (crisp at any size, tiny); otherwise a PNG at least 600px
   * wide with a transparent background. Until one of these exists the header
   * draws a styled wordmark instead, so nothing looks broken.
   */
  logoCandidates: [
    // A TRIMMED copy of their upload, and first for a reason: the original has
    // heavy transparent padding baked in (the artwork is only 55% of the image
    // height), so rendering it at a header size left the wordmark about 11px
    // tall and illegible. This version crops to the mark, so a 28px box gets
    // 28px of logo. Regenerate it if they send a new file.
    '/brand/partners/landscapes-unlimited.png',
    // The raw upload, kept as a fallback.
    '/brand/partners/Landscape_LogoFC.png',
    '/brand/partners/landscapes-unlimited.svg',
    '/brand/partners/landscapes-unlimited.jpg',
    '/brand/partners/landscapes-unlimited.jpeg',
    '/brand/partners/landscapes-unlimited.webp',
    // Catch-alls, in case the file is uploaded under a generic name.
    '/brand/partners/logo.svg',
    '/brand/partners/logo.png',
  ],
} as const;

// Their two greens, SAMPLED from the logo file they supplied (the two dominant
// non-white colors in Landscape_LogoFC.png), not guessed.
//
// These are an ACCENT only. The hub is Bratt-branded — orange owns primary
// actions, lime owns keylines. Their green appears on the co-brand credit line,
// a thin rule, and the handoff-status chip, so their reps see themselves in it
// without the page stopping looking like Bratt.
export const PARTNER_COLORS = {
  /** The wordmark green. */
  dark: '#065A2C',
  /** The leaf-mark green. Too light for text on white — accents only. */
  accent: '#A1CB60',
} as const;

export const BRATT = {
  /** Shown as the service provider, not as the hub's owner. */
  name: 'Bratt Tree Company',
} as const;

// NO EMAIL ADDRESS LIVES IN THIS FILE, deliberately.
//
// Two rules, both requested and both easy to undo by accident:
//
//   1. No individual's address is ever a fallback destination. Work orders go
//      only where PHP_ORDER_EMAIL says; if it isn't set, sending refuses rather
//      than quietly picking a person. See orderEmailAddress() in php-mail.ts.
//   2. No email address is rendered anywhere in the partner-facing UI. Their reps
//      contact us through their own Bratt relationship, not an inbox this tool
//      hands out.
//
// If a screen needs to tell the partner to get in touch, say so in words and
// leave the routing out of the page.

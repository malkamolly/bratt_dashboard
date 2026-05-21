// ============================================================================
// Training-deck helpers
// ============================================================================
// Small server-side utilities for the designed slide deck. The actual
// rendering happens in the browser via /public/training-deck/module-renderer.js
// (loaded inside an iframe), but we need:
//   - countSlides(): count slides for the module detail page
//   - moduleConfigFor(): build the meta object the renderer wants
//   - DEFAULT_SOURCE_TEXT: an empty-deck starter for the editor
// ============================================================================

import type { TrainingModule } from './crew-data';

/**
 * Counts how many `@layout` blocks appear in a module's source text.
 * Lines that start with `#` or `//` are comments; lines that start with
 * `@@` (e.g. `@@appendix`) are renderer hints, not slides.
 */
export function countSlides(source: string | null | undefined): number {
  if (!source) return 0;
  let n = 0;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith('@') && !line.startsWith('@@')) n++;
  }
  return n;
}

export type ModuleMeta = {
  moduleTitle: string;
  brandFooter: string;
  footerLeft: string;
  version: string;
  theme: string;
};

export function moduleMetaFor(mod: TrainingModule & { theme?: string }): ModuleMeta {
  const upperName = mod.name.toUpperCase();
  return {
    moduleTitle: mod.name,
    brandFooter: 'Bratt Tree · Training Series',
    footerLeft: `BRATT TREE  |  ${upperName}`,
    version: `Version ${mod.version}`,
    theme: (mod.theme as string | undefined) ?? 'bark-cream',
  };
}

export const VALID_THEMES = ['bark-cream', 'bark-heavy', 'field-manual'] as const;
export type Theme = (typeof VALID_THEMES)[number];

export function isValidTheme(t: string): t is Theme {
  return (VALID_THEMES as readonly string[]).includes(t);
}

export const DEFAULT_SOURCE_TEXT = `# Edit this to author a new training module.
# Each slide starts with @layout-name. See pattern reference in the help tab.

@cover
eyebrow: Operator Training
unit: New Module
subtitle: Replace with your module subtitle
tagline: Replace tagline one.
tagline: Replace tagline two.
meta-left: Bratt Tree · Training Series
meta-right: Version 1.0

@welcome
eyebrow: Welcome
title: Welcome.
subtitle: Write a one-line module intro here.
body: Replace this with a short paragraph that frames what the trainee is about to learn.
quote: A memorable line that sets the tone.

@closing
mark: BT
title: Thanks.
subtitle: Customize this closing slide.
`;

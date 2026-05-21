// ============================================================================
// Training-deck iframe source — /api/training-deck/[slug]
// ============================================================================
// Returns the standalone HTML page that boots the vanilla-JS renderer in
// /public/training-deck/. The /crew/modules/[slug]/present route renders an
// <iframe> pointing at this endpoint.
//
// We isolate the renderer in an iframe so its DOM mutations, custom element,
// and global styles don't collide with the React app.
// ============================================================================

import { NextResponse } from 'next/server';
import { requireHubAccess } from '@/lib/auth';
import { getTrainingModule } from '@/lib/crew-data';
import { moduleMetaFor, isValidTheme } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

// Escape any literal `</script>` inside the source text so we can safely
// embed the text in a <script type="text/plain"> tag.
function escapeForScriptTag(s: string): string {
  return s.replace(/<\/script/gi, '<\\/script');
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  await requireHubAccess('crew');
  const { slug } = await ctx.params;

  const mod = await getTrainingModule(slug);
  if (!mod) {
    return new NextResponse('Module not found', { status: 404 });
  }

  const source = ((mod as unknown as { source_text: string | null }).source_text ?? '').trim();
  if (!source) {
    return new NextResponse('This module has no slide source yet.', { status: 404 });
  }

  const meta = moduleMetaFor(mod as never);
  const theme = isValidTheme(meta.theme) ? meta.theme : 'bark-cream';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtmlAttr(mod.name)} — Bratt Tree Training</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/training-deck/module-styles.css">
</head>
<body data-theme="${escapeHtmlAttr(theme)}">

<script id="module-source" type="text/plain">${escapeForScriptTag(source)}</script>

<script>
  window.MODULE_CONFIG = ${JSON.stringify({
    moduleTitle: meta.moduleTitle,
    brandFooter: meta.brandFooter,
    footerLeft: meta.footerLeft,
    version: meta.version,
    theme,
    showAppendix: false,
  })};
</script>

<deck-stage width="1920" height="1080" id="deck"></deck-stage>

<script src="/training-deck/deck-stage.js"></script>
<script src="/training-deck/image-slot.js"></script>
<script src="/training-deck/module-renderer.js"></script>
<script>
  (function() {
    var deck = document.getElementById('deck');
    var src = (document.getElementById('module-source').textContent || '').trim();
    var cfg = window.MODULE_CONFIG || {};
    var meta = {
      moduleTitle: cfg.moduleTitle,
      brandFooter: cfg.brandFooter,
      footerLeft: cfg.footerLeft,
      version: cfg.version,
      railLeft: cfg.moduleTitle ? 'Bratt Tree · ' + cfg.moduleTitle : 'Bratt Tree · Training'
    };
    function boot() {
      try {
        var result = window.ModuleRenderer.renderToStage(deck, src, meta);
        if (typeof deck.refresh === 'function') deck.refresh();
        if (result && result.errors && result.errors.length) {
          console.warn('Module parse warnings:', result.errors);
        }
      } catch (e) {
        console.error('Failed to render module:', e);
      }
    }
    if (window.ModuleRenderer) boot();
    else window.addEventListener('load', boot);
  })();
</script>

</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

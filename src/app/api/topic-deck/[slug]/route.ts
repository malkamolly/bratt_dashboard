// ============================================================================
// Topic-deck iframe source — /api/topic-deck/[slug]
// ============================================================================
// Returns the standalone HTML page that boots the vanilla-JS renderer in
// /public/training-deck/ (shared with training modules and onboarding) for
// a topic deck. The /topics/[slug]/present route renders an <iframe>
// pointing at this endpoint.
// ============================================================================

import { NextResponse } from 'next/server';
import { getAllowedUser } from '@/lib/auth';
import {
  getTopicDeck,
  loadTopicSource,
  topicDeckMeta,
} from '@/lib/topic-deck';
import { isValidTheme } from '@/lib/training-deck';

export const dynamic = 'force-dynamic';

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
  const user = await getAllowedUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { slug } = await ctx.params;

  const deck = getTopicDeck(slug);
  if (!deck) {
    return new NextResponse('Topic deck not found', { status: 404 });
  }

  const source = (await loadTopicSource(slug))?.trim();
  if (!source) {
    return new NextResponse('This topic deck has no source yet.', {
      status: 404,
    });
  }

  const meta = topicDeckMeta(deck);
  const theme = isValidTheme(meta.theme) ? meta.theme : 'bark-cream';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtmlAttr(deck.title)} — Bratt Tree</title>
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
      railLeft: cfg.moduleTitle ? 'Bratt Tree · ' + cfg.moduleTitle : 'Bratt Tree · Library'
    };
    function boot() {
      try {
        var result = window.ModuleRenderer.renderToStage(deck, src, meta);
        if (typeof deck.refresh === 'function') deck.refresh();
        if (result && result.errors && result.errors.length) {
          console.warn('Topic deck parse warnings:', result.errors);
        }
      } catch (e) {
        console.error('Failed to render topic deck:', e);
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

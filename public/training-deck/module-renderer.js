/* ============================================================
   BRATT TREE TRAINING MODULE — Parser + Renderer
   Plain-text source → DOM slides inside <deck-stage>.
   ============================================================ */

(function(global) {
  'use strict';

  // ---------- helpers ----------
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // inline markdown: **bold** and *italic* on already-escaped text
  function inline(s) {
    if (s == null) return '';
    let out = esc(s);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    return out;
  }

  function splitPipe(s) {
    return String(s == null ? '' : s).split('|').map(x => x.trim());
  }

  // ============================================================
  // PARSER
  // ============================================================
  // Source format:
  //   @layout-name          — start a new slide
  //   key: value            — single-value field (or appended to array)
  //   - item                — list item (collected under 'items' key)
  //   # or //               — comment
  //
  // Keys repeating are collected as arrays. The renderer decides
  // whether to treat them as single or list.
  function parse(text) {
    const slides = [];
    let current = null;
    let appendixMode = false;
    const lines = text.split(/\r?\n/);
    let lineNo = 0;
    const errors = [];

    function pushField(key, val) {
      if (!current) {
        errors.push(`Line ${lineNo}: field "${key}" appears before any @layout directive.`);
        return;
      }
      if (current.fields[key] === undefined) {
        current.fields[key] = val;
      } else if (Array.isArray(current.fields[key])) {
        current.fields[key].push(val);
      } else {
        current.fields[key] = [current.fields[key], val];
      }
    }

    for (const rawLine of lines) {
      lineNo++;
      const line = rawLine.replace(/\s+$/, '');
      if (!line.trim()) continue;
      if (/^\s*(#|\/\/)/.test(line)) continue;

      // new slide
      const slideMatch = line.match(/^@([a-z][a-z0-9-]*)\s*(.*)?$/i);
      if (slideMatch) {
        current = {
          layout: slideMatch[1].toLowerCase(),
          label: (slideMatch[2] || '').trim() || null,
          fields: {},
          items: [],
          source: { startLine: lineNo },
          _isAppendix: appendixMode
        };
        slides.push(current);
        continue;
      }

      // appendix mode toggle
      if (/^\s*@@appendix\s*$/i.test(line)) {
        appendixMode = true;
        continue;
      }

      // list item
      const listMatch = line.match(/^\s*-\s+(.+)$/);
      if (listMatch) {
        if (!current) {
          errors.push(`Line ${lineNo}: list item appears before any @layout directive.`);
          continue;
        }
        current.items.push(listMatch[1].trim());
        continue;
      }

      // key: value
      const fieldMatch = line.match(/^\s*([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i);
      if (fieldMatch) {
        const key = fieldMatch[1].toLowerCase();
        const val = fieldMatch[2];
        pushField(key, val);
        continue;
      }

      // continuation: append to last-set field (multi-line bodies)
      if (current) {
        const keys = Object.keys(current.fields);
        const lastKey = keys[keys.length - 1];
        if (lastKey != null) {
          const indented = line.match(/^\s+(.+)$/);
          if (indented) {
            const v = current.fields[lastKey];
            if (Array.isArray(v)) {
              v[v.length - 1] = v[v.length - 1] + ' ' + indented[1].trim();
            } else {
              current.fields[lastKey] = (v || '') + ' ' + indented[1].trim();
            }
            continue;
          }
        }
        errors.push(`Line ${lineNo}: couldn't parse "${line.trim().slice(0, 60)}"`);
      } else {
        errors.push(`Line ${lineNo}: stray content before first @layout: "${line.trim().slice(0, 60)}"`);
      }
    }

    return { slides, errors };
  }

  // helper: get a field as a string or null
  function f(s, key) { const v = s.fields[key]; return v == null ? null : (Array.isArray(v) ? v[0] : v); }
  // helper: get a field as array (single or multi → always array)
  function fa(s, key) {
    const v = s.fields[key];
    if (v == null) return [];
    return Array.isArray(v) ? v.slice() : [v];
  }

  // shared chrome bits
  function topRail(s, meta) {
    const left = f(s, 'rail-left') || meta.railLeft || '';
    const right = f(s, 'rail-right') || (s.fields['section'] ? esc(f(s, 'section')) : '');
    if (!left && !right) return '';
    return `<div class="slide-top-rail"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;
  }
  function footer(s, idx, meta) {
    const left = meta.footerLeft || 'BRATT TREE  |  ' + (meta.moduleTitle || 'TRAINING MODULE').toUpperCase();
    return `<div class="slide-footer"><span>${esc(left)}</span><span class="footer-num">${idx + 1}</span></div>`;
  }

  function eyebrowEl(s) {
    const e = f(s, 'eyebrow');
    return e ? `<div class="slide-eyebrow">${esc(e)}</div>` : '';
  }
  function titleEl(s) {
    const t = f(s, 'title');
    return t ? `<h2 class="slide-title">${inline(t)}</h2>` : '';
  }
  function subtitleEl(s) {
    const st = f(s, 'subtitle');
    return st ? `<p class="slide-subtitle">${inline(st)}</p>` : '';
  }
  function titleBlock(s) {
    return `${eyebrowEl(s)}${titleEl(s)}${subtitleEl(s)}`;
  }

  // ============================================================
  // LAYOUT RENDERERS
  // ============================================================
  const layouts = {};

  // -------- 1. COVER --------
  layouts['cover'] = (s, idx, meta) => {
    const eyebrow = f(s, 'eyebrow') || 'Operator Training';
    const unit = f(s, 'unit') || meta.moduleTitle || 'Module Name';
    const subtitle = f(s, 'subtitle') || '';
    const taglines = fa(s, 'tagline');
    const left = f(s, 'meta-left') || meta.brandFooter || 'Bratt Tree · New Hire Training Series';
    const right = f(s, 'meta-right') || meta.version || 'Version 1.0';
    const imgId = f(s, 'image-id') || 'cover-image';
    const imgPlaceholder = f(s, 'image-placeholder') || 'Drop unit/equipment photo here';
    // Optional: bake in a fixed image so the cover isn't a drop target.
    // When `image` is set, render a plain <img> instead of the user-fillable
    // image-slot — this is how the onboarding cover pins the mascot.
    const imgSrc = f(s, 'image');
    return `
      <section class="slide slide--cover" data-screen-label="Cover · ${esc(unit)}">
        <div class="cover-text">
          <div class="cover-eyebrow">${esc(eyebrow)}</div>
          <h1 class="cover-name">${esc(unit)}</h1>
          ${subtitle ? `<div class="cover-subtitle">${esc(subtitle)}</div>` : ''}
          ${taglines.length ? `<div class="cover-taglines">${taglines.map(t => `<div class="cover-tagline">${esc(t)}</div>`).join('')}</div>` : ''}
        </div>
        <div class="cover-imagery">
          ${imgSrc
            ? `<img class="cover-image-fixed" src="${esc(imgSrc)}" alt="${esc(unit)}">`
            : `<image-slot id="${esc(imgId)}" shape="circle" placeholder="${esc(imgPlaceholder)}"></image-slot>`}
        </div>
        <div class="cover-meta">
          <span>${esc(left)}</span>
          <span>${esc(right)}</span>
        </div>
      </section>
    `;
  };

  // -------- 2. WELCOME / QUOTE --------
  layouts['welcome'] = (s, idx, meta) => {
    const bodies = fa(s, 'body');
    const quote = f(s, 'quote');
    // Optional: render a collage of logos/images in the right column instead
    // of a quote. Each "collage" line is "Label | url"; if the url is blank
    // the cell renders as an empty image-slot (drag-and-drop placeholder).
    const collage = fa(s, 'collage').map((row, i) => {
      const [label, url] = splitPipe(row);
      const slotId = `welcome-collage-${idx}-${i}`;
      if (url && url.trim()) {
        return `
          <div class="welcome-collage-cell">
            <img src="${esc(url.trim())}" alt="${esc(label || '')}">
            ${label ? `<div class="welcome-collage-label">${esc(label)}</div>` : ''}
          </div>`;
      }
      return `
        <div class="welcome-collage-cell">
          <image-slot id="${esc(slotId)}" shape="rounded" placeholder="${esc(label || 'Drop logo')}"></image-slot>
          ${label ? `<div class="welcome-collage-label">${esc(label)}</div>` : ''}
        </div>`;
    }).join('');
    // No quote and no collage → go single-column so the empty brown panel
    // doesn't show up on slides that are just a welcome message.
    const hasSidePanel = !!quote || collage.length > 0;
    return `
      <section class="slide slide--welcome${hasSidePanel ? '' : ' slide--welcome-solo'}" data-screen-label="Welcome"${hasSidePanel ? '' : ' style="grid-template-columns:1fr"'}>
        ${topRail(s, meta)}
        <div class="welcome-body">
          ${eyebrowEl(s)}
          ${titleEl(s)}
          ${subtitleEl(s)}
          <div style="height:32px"></div>
          ${bodies.map(b => `<p>${inline(b)}</p>`).join('')}
        </div>
        ${hasSidePanel ? `
          <div class="welcome-quote${collage ? ' welcome-quote--collage' : ''}">
            ${collage
              ? `<div class="welcome-collage-grid">${collage}</div>`
              : (quote ? `<blockquote>${inline(quote)}</blockquote>` : '')}
          </div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 3. AGENDA --------
  layouts['agenda'] = (s, idx, meta) => {
    // items as "Name | Description"
    const items = s.items.map((row, i) => {
      const [name, desc] = splitPipe(row);
      return `
        <div class="agenda-item">
          <div class="agenda-num">${String(i + 1).padStart(2, '0')}</div>
          <div class="agenda-name">${inline(name || '')}</div>
          ${desc ? `<div class="agenda-desc">${inline(desc)}</div>` : ''}
        </div>`;
    }).join('');
    return `
      <section class="slide slide--agenda" data-screen-label="Agenda">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="agenda-grid">${items}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 4. SECTION DIVIDER --------
  layouts['section-divider'] = (s, idx, meta) => {
    const num = f(s, 'number') || '00';
    const title = f(s, 'title') || 'Section';
    const tagline = f(s, 'tagline');
    return `
      <section class="slide slide--section-divider" data-screen-label="Section ${esc(num)}: ${esc(title)}">
        <div>
          <div class="section-num">Section ${esc(num)}</div>
          <h2 class="section-title">${esc(title)}</h2>
          ${tagline ? `<div class="section-tagline">${inline(tagline)}</div>` : ''}
        </div>
        <div class="section-side">
          <div class="section-mark"><div class="mark-num">${esc(num)}</div></div>
        </div>
      </section>
    `;
  };

  // -------- 5. HERO STATS --------
  layouts['hero-stats'] = (s, idx, meta) => {
    const stats = fa(s, 'stat').slice(0, 3);
    const statsHtml = stats.map(st => {
      const [num, unit, label] = splitPipe(st);
      return `
        <div class="hero-stat">
          <span class="hero-stat-num">${esc(num || '')}</span>${unit ? `<span class="hero-stat-unit">${esc(unit)}</span>` : ''}
          <div class="hero-stat-label">${esc(label || '')}</div>
        </div>`;
    }).join('');
    const points = fa(s, 'point');
    const panelTitle = f(s, 'panel-title');
    return `
      <section class="slide slide--hero-stats" data-screen-label="${esc(f(s, 'title') || 'Overview')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        ${stats.length ? `<div class="hero-stats-row">${statsHtml}</div>` : ''}
        ${(points.length || panelTitle) ? `
          <div class="hero-panel">
            ${panelTitle ? `<div class="hero-panel-title">${esc(panelTitle)}</div>` : ''}
            ${points.map(p => `<div class="hero-panel-item">${inline(p)}</div>`).join('')}
          </div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 6. SPECS TABLE --------
  layouts['table'] = (s, idx, meta) => {
    const cols = splitPipe(f(s, 'cols') || 'Spec | Value');
    const rows = fa(s, 'row').map(r => splitPipe(r));
    const tip = f(s, 'tip');
    return `
      <section class="slide slide--table" data-screen-label="${esc(f(s, 'title') || 'Specifications')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <table class="spec-table">
          <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        ${tip ? `<div class="tip-ribbon">${inline(tip)}</div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 7. TWO COLUMN --------
  layouts['two-column'] = (s, idx, meta) => {
    const leftHeader = f(s, 'left-header') || 'Do';
    const rightHeader = f(s, 'right-header') || "Don't";
    const leftItems = fa(s, 'left');
    const rightItems = fa(s, 'right');
    const leftIcon = f(s, 'left-icon') || '✓';
    const rightIcon = f(s, 'right-icon') || '×';
    const takeaway = f(s, 'takeaway');
    return `
      <section class="slide slide--two-column" data-screen-label="${esc(f(s, 'title') || 'Two-column')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="two-col-grid">
          <div class="two-col col--good">
            <h3 class="two-col-header"><span class="two-col-icon">${esc(leftIcon)}</span>${esc(leftHeader)}</h3>
            <ul>${leftItems.map(i => `<li>${inline(i)}</li>`).join('')}</ul>
          </div>
          <div class="two-col col--bad">
            <h3 class="two-col-header"><span class="two-col-icon">${esc(rightIcon)}</span>${esc(rightHeader)}</h3>
            <ul>${rightItems.map(i => `<li>${inline(i)}</li>`).join('')}</ul>
          </div>
        </div>
        ${takeaway ? `<div class="takeaway">${inline(takeaway)}</div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 8. QUICK FACTS --------
  layouts['quick-facts'] = (s, idx, meta) => {
    const panelTitle = f(s, 'panel-title') || 'Quick Facts';
    const facts = fa(s, 'fact').map(r => splitPipe(r));
    const listTitle = f(s, 'list-title');
    return `
      <section class="slide slide--quick-facts" data-screen-label="${esc(f(s, 'title') || 'Quick facts')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="qf-grid">
          <div class="qf-panel">
            <div class="qf-panel-title">${esc(panelTitle)}</div>
            ${facts.map(([label, val]) => `
              <div class="qf-row">
                <div class="qf-label">${esc(label || '')}</div>
                <div class="qf-val">${inline(val || '')}</div>
              </div>`).join('')}
          </div>
          <div class="qf-list">
            ${listTitle ? `<div class="qf-list-title">${esc(listTitle)}</div>` : ''}
            <ul>${s.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>
          </div>
        </div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 9. PPE GRID --------
  layouts['ppe-grid'] = (s, idx, meta) => {
    // item: "Name | Description"          → letter icon (original behavior)
    // item: "Name | Description | url"    → image icon, uniformly sized
    const items = fa(s, 'item').map((r, i) => {
      const [name, desc, image] = splitPipe(r);
      const initial = (name || '').trim().charAt(0).toUpperCase() || (i + 1);
      const icon = image && image.trim()
        ? `<div class="ppe-icon ppe-icon--image"><img src="${esc(image.trim())}" alt="${esc(name || '')}"></div>`
        : `<div class="ppe-icon">${esc(initial)}</div>`;
      return `
        <div class="ppe-card">
          ${icon}
          <div class="ppe-name">${esc(name || '')}</div>
          <div class="ppe-desc">${inline(desc || '')}</div>
        </div>`;
    }).join('');
    return `
      <section class="slide slide--ppe-grid" data-screen-label="${esc(f(s, 'title') || 'PPE')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="ppe-grid">${items}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 10. CHECKLIST --------
  layouts['checklist'] = (s, idx, meta) => {
    return `
      <section class="slide slide--checklist" data-screen-label="${esc(f(s, 'title') || 'Checklist')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="checklist-grid">
          ${s.items.map(i => `
            <div class="checklist-item">
              <div class="checklist-box"></div>
              <div>${inline(i)}</div>
            </div>`).join('')}
        </div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 11. BIG STAT --------
  layouts['big-stat'] = (s, idx, meta) => {
    const stat = f(s, 'stat') || '00%';
    const caption = f(s, 'stat-caption');
    const source = f(s, 'source');
    const panelTitle = f(s, 'panel-title') || 'The Rules';
    return `
      <section class="slide slide--big-stat" data-screen-label="${esc(f(s, 'title') || 'Key stat')}">
        ${topRail(s, meta)}
        <div class="big-stat-left">
          ${eyebrowEl(s)}
          ${titleEl(s)}
          ${subtitleEl(s)}
          <div class="big-stat-value">${esc(stat)}</div>
          ${caption ? `<div class="big-stat-caption">${inline(caption)}</div>` : ''}
          ${source ? `<div class="big-stat-source">${esc(source)}</div>` : ''}
        </div>
        <div class="big-stat-right">
          <div class="big-stat-panel-title">${esc(panelTitle)}</div>
          <ul>${s.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>
        </div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 12. HAZARD GRID --------
  layouts['hazard-grid'] = (s, idx, meta) => {
    const hero = f(s, 'hero');
    const cards = fa(s, 'item').map(r => {
      const [name, desc] = splitPipe(r);
      return `
        <div class="hazard-card">
          <div class="hazard-name">${esc(name || '')}</div>
          <div class="hazard-desc">${inline(desc || '')}</div>
        </div>`;
    }).join('');
    return `
      <section class="slide slide--hazard-grid" data-screen-label="${esc(f(s, 'title') || 'Hazards')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        ${hero ? `<div class="hazard-hero">${inline(hero)}</div>` : ''}
        <div class="hazard-grid">${cards}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 13. THREE RULES --------
  layouts['three-rules'] = (s, idx, meta) => {
    const rules = fa(s, 'rule').slice(0, 3).map((r, i) => {
      const [title, body] = splitPipe(r);
      return `
        <div class="rule-card">
          <div class="rule-num">${i + 1}</div>
          <h3 class="rule-title">${esc(title || '')}</h3>
          <p class="rule-body">${inline(body || '')}</p>
        </div>`;
    }).join('');
    return `
      <section class="slide slide--three-rules" data-screen-label="${esc(f(s, 'title') || 'Rules')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="rules-grid">${rules}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 14. NUMBERED STEPS --------
  layouts['steps'] = (s, idx, meta) => {
    const steps = fa(s, 'step').map((r, i) => {
      const [name, body] = splitPipe(r);
      return `
        <div class="step-card">
          <div class="step-num">${i + 1}</div>
          <div class="step-name">${esc(name || '')}</div>
          <div class="step-body">${inline(body || '')}</div>
        </div>`;
    }).join('');
    return `
      <section class="slide slide--steps" data-screen-label="${esc(f(s, 'title') || 'Steps')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="steps-grid">${steps}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 15. TECHNIQUE CARDS --------
  layouts['technique'] = (s, idx, meta) => {
    const lead = f(s, 'lead');
    const cards = fa(s, 'card').map(r => {
      const [name, body] = splitPipe(r);
      return `
        <div class="tech-card">
          <div class="tech-name">${esc(name || '')}</div>
          <div class="tech-desc">${inline(body || '')}</div>
        </div>`;
    }).join('');
    const warn = f(s, 'warn');
    return `
      <section class="slide slide--technique" data-screen-label="${esc(f(s, 'title') || 'Technique')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        ${lead ? `<p class="tech-lead">${inline(lead)}</p>` : ''}
        <div class="tech-grid">${cards}</div>
        ${warn ? `<div class="tech-warn"><b>Avoid</b> ${inline(warn)}</div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 16. INTERVAL TABLE --------
  layouts['interval-table'] = (s, idx, meta) => {
    const cols = splitPipe(f(s, 'cols') || 'Interval | Operator | Shop');
    const rows = fa(s, 'row').map(r => splitPipe(r));
    const note = f(s, 'note');
    return `
      <section class="slide slide--interval-table" data-screen-label="${esc(f(s, 'title') || 'Intervals')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <table class="interval-table">
          <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        ${note ? `<div class="interval-note">${inline(note)}</div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 17. MISTAKES (X LIST) --------
  layouts['mistakes'] = (s, idx, meta) => {
    return `
      <section class="slide slide--mistakes" data-screen-label="${esc(f(s, 'title') || 'Mistakes')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="mistakes-grid">
          ${s.items.map(i => `
            <div class="mistake-row">
              <div class="mistake-x">×</div>
              <div>${inline(i)}</div>
            </div>`).join('')}
        </div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 18. HAND SIGNALS --------
  layouts['hand-signals'] = (s, idx, meta) => {
    const cards = fa(s, 'signal').map(r => {
      const [name, desc] = splitPipe(r);
      const glyph = (name || '?').trim().charAt(0);
      return `
        <div class="signal-card">
          <div class="signal-glyph">${esc(glyph)}</div>
          <div class="signal-name">${esc(name || '')}</div>
          <div class="signal-desc">${inline(desc || '')}</div>
        </div>`;
    }).join('');
    const footnote = f(s, 'footnote');
    return `
      <section class="slide slide--hand-signals" data-screen-label="${esc(f(s, 'title') || 'Signals')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="signals-grid">${cards}</div>
        ${footnote ? `<div class="signals-footnote">${inline(footnote)}</div>` : ''}
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 19. PRACTICAL TEST CHECKLIST --------
  layouts['test-checklist'] = (s, idx, meta) => {
    const cols = splitPipe(f(s, 'cols') || 'Area | Task | Pass | Trainer Initials');
    const rows = fa(s, 'row').map(r => splitPipe(r));
    return `
      <section class="slide slide--test-checklist" data-screen-label="${esc(f(s, 'title') || 'Test-out')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <table class="test-table">
          <thead><tr>
            ${cols.map((c, i) => {
              if (i === 0) return `<th>${esc(c)}</th>`;
              if (/pass/i.test(c)) return `<th class="checkbox-cell">${esc(c)}</th>`;
              if (/initial/i.test(c)) return `<th class="initials-cell">${esc(c)}</th>`;
              return `<th>${esc(c)}</th>`;
            }).join('')}
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${
              r.map((c, i) => {
                const colHeader = cols[i] || '';
                if (/pass/i.test(colHeader)) {
                  return `<td class="checkbox-cell"><span class="test-check"></span></td>`;
                }
                if (/initial/i.test(colHeader)) {
                  return `<td class="initials-cell"></td>`;
                }
                return `<td>${inline(c)}</td>`;
              }).join('')
            }</tr>`).join('')}
          </tbody>
        </table>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 20. QUIZ --------
  layouts['quiz'] = (s, idx, meta) => {
    // questions parsed as repeated 'q:' + 'a:' tuples in source order
    // simpler: use 'q' which gives "Prompt || ChoiceA | ChoiceB | ChoiceC | ChoiceD"
    const qs = fa(s, 'q').map((q, i) => {
      const parts = splitPipe(q);
      const prompt = parts.shift();
      return `
        <div class="quiz-q">
          <div class="quiz-q-num">Q${i + 1}</div>
          <div class="quiz-q-prompt">${inline(prompt || '')}</div>
          <ul class="quiz-q-choices">
            ${parts.map((c, ci) => `<li><b>${String.fromCharCode(65 + ci)})</b> ${inline(c)}</li>`).join('')}
          </ul>
        </div>`;
    }).join('');
    return `
      <section class="slide slide--quiz" data-screen-label="${esc(f(s, 'title') || 'Quiz')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="quiz-grid">${qs}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 21. QUIZ ANSWERS --------
  layouts['quiz-answers'] = (s, idx, meta) => {
    const items = fa(s, 'a').map((a, i) => {
      const [letter, body] = splitPipe(a);
      return `
        <div class="answer-card">
          <div class="answer-num">Q${i + 1}</div>
          <div>
            <div class="answer-letter">${inline(letter || '')}</div>
            <p class="answer-body">${inline(body || '')}</p>
          </div>
        </div>`;
    }).join('');
    return `
      <section class="slide slide--quiz-answers" data-screen-label="${esc(f(s, 'title') || 'Answers')}">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="answers-grid">${items}</div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 22. RESOURCES + SIGN-OFF --------
  layouts['resources'] = (s, idx, meta) => {
    const panelTitle = f(s, 'panel-title') || 'Reference Materials';
    const links = fa(s, 'link').map(r => {
      const [label, target] = splitPipe(r);
      return `
        <div class="resource-link">
          <div class="resource-link-label">${inline(label || '')}</div>
          <div class="resource-link-target">${esc(target || '')}</div>
        </div>`;
    }).join('');
    const sigStatement = f(s, 'signature-statement') || 'I have completed this training course.';
    const fields = fa(s, 'field');
    return `
      <section class="slide slide--resources" data-screen-label="Resources & sign-off">
        ${topRail(s, meta)}
        ${titleBlock(s)}
        <div class="resources-grid">
          <div>
            <div class="resources-panel-title">${esc(panelTitle)}</div>
            ${links}
          </div>
          <div class="signature-block">
            <p class="signature-statement">${inline(sigStatement)}</p>
            ${fields.map(label => `
              <div class="signature-field">
                <div class="signature-field-label">${esc(label)}</div>
                <div class="signature-field-line"></div>
              </div>`).join('')}
          </div>
        </div>
        ${footer(s, idx, meta)}
      </section>
    `;
  };

  // -------- 23. CLOSING --------
  layouts['closing'] = (s, idx, meta) => {
    const title = f(s, 'title') || 'Welcome to the crew.';
    const subtitle = f(s, 'subtitle') || '';
    const mark = f(s, 'mark') || 'BT';
    return `
      <section class="slide slide--closing" data-screen-label="Closing">
        <div class="closing-mark">${esc(mark)}</div>
        <h2 class="closing-title">${inline(title)}</h2>
        ${subtitle ? `<div class="closing-tagline">${inline(subtitle)}</div>` : ''}
      </section>
    `;
  };

  // alias for unknown
  layouts['blank'] = (s, idx, meta) => `
    <section class="slide" data-screen-label="${esc(f(s, 'title') || 'Blank')}">
      ${topRail(s, meta)}
      ${titleBlock(s)}
      ${footer(s, idx, meta)}
    </section>
  `;

  // -------- APPENDIX (pattern reference) --------
  function withAppendixLabel(html, layoutName) {
    return html.replace(/^(\s*<section[^>]*?)>/m, `$1>
      <div class="appendix-label">@${esc(layoutName)}</div>`);
  }

  // ============================================================
  // RENDER PIPELINE
  // ============================================================
  function render(text, meta) {
    const { slides, errors } = parse(text);
    const out = [];
    slides.forEach((s, idx) => {
      const layout = layouts[s.layout] || layouts['blank'];
      let html = layout(s, idx, meta);
      if (s._isAppendix) {
        html = withAppendixLabel(html, s.layout);
      }
      out.push({ html, layout: s.layout, label: s.label });
    });
    return { renderedSlides: out, errors };
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  global.ModuleRenderer = {
    parse, render, layouts,
    listLayouts() { return Object.keys(layouts).filter(k => k !== 'blank'); },
    renderToStage(deckEl, text, meta = {}) {
      const { renderedSlides, errors } = render(text, meta);
      // clear deck
      while (deckEl.firstChild) deckEl.removeChild(deckEl.firstChild);
      // build container, then attach
      const frag = document.createElement('div');
      frag.innerHTML = renderedSlides.map(s => s.html).join('\n');
      while (frag.firstChild) {
        deckEl.appendChild(frag.firstChild);
      }
      return { slideCount: renderedSlides.length, errors };
    }
  };
})(window);

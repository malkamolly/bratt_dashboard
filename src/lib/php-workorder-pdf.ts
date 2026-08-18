// ============================================================================
// Plant Health Program — work order PDF (SERVER ONLY)
// ============================================================================
// Builds the PDF that goes to Bratt when the partner accepts a work order.
//
// Uses pdf-lib rather than rendering HTML in a headless browser: it's pure JS
// with no native binaries, so it runs in a Vercel function without a custom
// build, and a work order is a table — it does not need a browser's layout
// engine.
//
// Photos ARE embedded. The whole reason a photo is required per tree is so our
// arborist can check the treatment against what the rep actually saw, and making
// him log in to do that would mean he mostly won't. They're already downscaled
// to ~1600px JPEG by the browser at upload, so a six-tree order lands a few MB —
// fine for email.
// ============================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatCents } from './php-quote';
import { HANDOFF_STATUS_LABELS, JOB_STATUS_LABELS } from './partner-types';
import type { WorkOrder } from './partner-types';
import { BRATT, PARTNER, PROGRAM } from './partner-config';
import { formatBusinessDate } from './dates';
import { loadBrattLogo, loadPartnerLogo } from './brand-assets';
import { PARTNER_COLORS } from './partner-config';

// Bratt brand colors, as pdf-lib rgb (0–1 floats).
const ORANGE = rgb(0.922, 0.298, 0.106); // #EB4C1B
const BARK = rgb(0.149, 0.098, 0.055); // #26190E
const INK = rgb(0.102, 0.055, 0.02); // #1A0E05
const GREY = rgb(0.42, 0.38, 0.33);
const RULE = rgb(0.91, 0.86, 0.75);
const CREAM = rgb(1, 0.973, 0.925);
const LIME = rgb(0.914, 0.906, 0.114);

/** The partner's greens, parsed from PARTNER_COLORS so there is one source. */
function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
const PARTNER_DARK = hexToRgb(PARTNER_COLORS.dark);
const PARTNER_ACCENT = hexToRgb(PARTNER_COLORS.accent);

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

type Ctx = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  bold: PDFFont;
  body: PDFFont;
};

/** Starts a new page when the next block wouldn't fit. */
function ensureRoom(ctx: Ctx, needed: number): void {
  if (ctx.y - needed > MARGIN + 40) return;
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

function text(
  ctx: Ctx,
  value: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {},
): void {
  const size = opts.size ?? 10;
  ctx.page.drawText(value, {
    x: opts.x ?? MARGIN,
    y: ctx.y,
    size,
    font: opts.bold ? ctx.bold : ctx.body,
    color: opts.color ?? INK,
  });
}

/** Wraps a string to a width, returning the lines. */
function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Renders the work order.
 *
 * `photos` maps a photo id to its raw bytes — fetched by the caller, because
 * this module deliberately does no I/O beyond building the document.
 */
export async function buildWorkOrderPdf(
  order: WorkOrder,
  photos: Map<string, Uint8Array>,
  sentAt: Date,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);

  const ctx: Ctx = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    bold,
    body,
  };

  const { proposal } = order;

  // ---- Header band: a real two-brand lockup -----------------------------
  // Both marks sit on the bark band at the same visual weight, because this IS a
  // partnership — a rep hands this to their customer, and the customer should see
  // both companies. Bratt leads (we do the work and stand behind it), Landscapes
  // Unlimited closes, with their green as the divider between them.
  const HEADER_H = 132;
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H,
    width: PAGE_W,
    height: HEADER_H,
    color: BARK,
  });
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H - 6,
    width: PAGE_W,
    height: 6,
    color: ORANGE,
  });
  // Their green, as a hairline under the orange — the same accent the hub uses.
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - HEADER_H - 9,
    width: PAGE_W,
    height: 3,
    color: PARTNER_ACCENT,
  });

  const brattLogo = await tryEmbed(doc, (await loadBrattLogo()) ?? new Uint8Array());
  const partnerLogo = await tryEmbed(doc, (await loadPartnerLogo()) ?? new Uint8Array());

  // Bratt badge, or the name in type if the file isn't there.
  let cursorX = MARGIN;
  if (brattLogo) {
    const h = 60;
    const w = (brattLogo.width / brattLogo.height) * h;
    ctx.page.drawImage(brattLogo, {
      x: cursorX,
      y: PAGE_H - 22 - h,
      width: w,
      height: h,
    });
    cursorX += w + 16;
  } else {
    ctx.page.drawText(BRATT.name.toUpperCase(), {
      x: cursorX,
      y: PAGE_H - 52,
      size: 17,
      font: bold,
      color: CREAM,
    });
    cursorX += bold.widthOfTextAtSize(BRATT.name.toUpperCase(), 17) + 16;
  }

  // Partner logo on a white chip — their mark is dark green on transparent and
  // would disappear against the bark panel.
  if (partnerLogo) {
    const h = 34;
    const w = (partnerLogo.width / partnerLogo.height) * h;
    const padX = 10;
    const padY = 8;
    const chipW = w + padX * 2;
    const chipX = PAGE_W - MARGIN - chipW;
    const chipY = PAGE_H - 34 - h - padY;

    ctx.page.drawText('IN PARTNERSHIP WITH', {
      x: PAGE_W - MARGIN - bold.widthOfTextAtSize('IN PARTNERSHIP WITH', 7),
      y: PAGE_H - 20,
      size: 7,
      font: bold,
      color: PARTNER_ACCENT,
    });
    ctx.page.drawRectangle({
      x: chipX,
      y: chipY,
      width: chipW,
      height: h + padY * 2,
      color: rgb(1, 1, 1),
    });
    ctx.page.drawImage(partnerLogo, {
      x: chipX + padX,
      y: chipY + padY,
      width: w,
      height: h,
    });
  } else {
    ctx.page.drawText(PARTNER.name.toUpperCase(), {
      x: PAGE_W - MARGIN - bold.widthOfTextAtSize(PARTNER.name.toUpperCase(), 11),
      y: PAGE_H - 40,
      size: 11,
      font: bold,
      color: CREAM,
    });
  }

  // Program name + reference, under the marks.
  ctx.page.drawText(`${PROGRAM.name.toUpperCase()}  ·  WORK ORDER`, {
    x: MARGIN,
    y: PAGE_H - HEADER_H + 22,
    size: 9,
    font: bold,
    color: LIME,
  });

  const ref = `${proposal.reference}${proposal.revision > 1 ? ` · REV ${proposal.revision}` : ''}`;
  ctx.page.drawText(ref, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(ref, 12),
    y: PAGE_H - HEADER_H + 34,
    size: 12,
    font: bold,
    color: CREAM,
  });
  // Central, not UTC: a work order sent after 7 PM Minneapolis time would
  // otherwise be dated tomorrow on the copy in Bratt's inbox.
  const dateLine = formatBusinessDate(sentAt);
  ctx.page.drawText(dateLine, {
    x: PAGE_W - MARGIN - body.widthOfTextAtSize(dateLine, 8),
    y: PAGE_H - HEADER_H + 20,
    size: 8,
    font: body,
    color: rgb(0.75, 0.72, 0.68),
  });

  ctx.y = PAGE_H - HEADER_H - 32;

  // ---- Job block ---------------------------------------------------------
  text(ctx, proposal.jobName, { size: 17, bold: true });
  ctx.y -= 22;
  text(ctx, proposal.formattedAddress ?? proposal.siteAddress, { size: 10.5, color: GREY });
  ctx.y -= 16;
  if (!proposal.formattedAddress) {
    text(ctx, 'Address not confirmed against the map — verify before dispatch.', {
      size: 8.5,
      color: ORANGE,
      bold: true,
    });
    ctx.y -= 14;
  }

  const meta = [
    proposal.salespersonName ? `Salesperson: ${proposal.salespersonName}` : null,
    `Job status: ${JOB_STATUS_LABELS[proposal.jobStatus]}`,
    `Handoff: ${HANDOFF_STATUS_LABELS[proposal.handoffStatus]}`,
  ]
    .filter(Boolean)
    .join('   ·   ');
  text(ctx, meta, { size: 9, color: GREY });
  ctx.y -= 26;

  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 1,
    color: RULE,
  });
  ctx.y -= 24;

  // ---- Trees -------------------------------------------------------------
  for (const [i, tree] of order.trees.entries()) {
    ensureRoom(ctx, 150);

    text(ctx, `${i + 1}. ${tree.label}`, { size: 12.5, bold: true });
    ctx.y -= 17;

    const dims = [
      tree.species ?? 'Species not noted',
      `${tree.dbh}" DBH`,
      tree.heightFt != null ? `${tree.heightFt} ft tall` : null,
      tree.crownSpreadFt != null ? `${tree.crownSpreadFt} ft spread` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');
    text(ctx, dims, { size: 9, color: GREY });
    ctx.y -= 20;

    // Treatment lines, price right-aligned.
    for (const tr of tree.treatments) {
      ensureRoom(ctx, 30);
      const name = tr.serviceName ?? tr.serviceId;
      for (const [li, line] of wrap(name, body, 10, CONTENT_W - 110).entries()) {
        text(ctx, li === 0 ? `• ${line}` : `  ${line}`, { size: 10, x: MARGIN + 8 });
        if (li === 0) {
          const price = tr.needsQuote ? 'Bratt to quote' : formatCents(tr.unitPriceCents ?? 0);
          ctx.page.drawText(price, {
            x: PAGE_W - MARGIN - bold.widthOfTextAtSize(price, 10),
            y: ctx.y,
            size: 10,
            font: bold,
            color: tr.needsQuote ? ORANGE : INK,
          });
        }
        ctx.y -= 15;
      }
      if (tr.needsQuote && tr.quoteNote) {
        for (const line of wrap(tr.quoteNote, body, 8, CONTENT_W - 24)) {
          text(ctx, line, { size: 8.5, color: ORANGE, x: MARGIN + 18 });
          ctx.y -= 12;
        }
      }
    }

    if (tree.treatments.length === 0) {
      text(ctx, '• No treatment selected', { size: 10, color: ORANGE, x: MARGIN + 8 });
      ctx.y -= 15;
    }

    if (tree.notes) {
      ctx.y -= 2;
      for (const line of wrap(`Notes: ${tree.notes}`, body, 9, CONTENT_W - 16)) {
        text(ctx, line, { size: 9, color: GREY, x: MARGIN + 8 });
        ctx.y -= 12;
      }
    }

    // ---- Photos for this tree ---------------------------------------------
    const available = tree.photos
      .map((p) => photos.get(p.id))
      .filter((b): b is Uint8Array => !!b);

    if (available.length) {
      const thumbW = 108;
      const thumbH = 81;
      ensureRoom(ctx, thumbH + 20);
      ctx.y -= 6;
      let x = MARGIN + 8;
      for (const bytes of available.slice(0, 4)) {
        try {
          // Everything we store is JPEG (the browser re-encodes on upload); PNG
          // is accepted by the API, so fall back rather than dropping the photo.
          const img = await tryEmbed(doc, bytes);
          if (!img) continue;
          const scale = Math.min(thumbW / img.width, thumbH / img.height);
          ctx.page.drawImage(img, {
            x,
            y: ctx.y - thumbH,
            width: img.width * scale,
            height: img.height * scale,
          });
          x += thumbW + 8;
        } catch {
          // A single unreadable photo must not sink the whole work order.
        }
      }
      ctx.y -= thumbH + 8;
    }

    ctx.y -= 14;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_W - MARGIN, y: ctx.y },
      thickness: 0.5,
      color: RULE,
    });
    ctx.y -= 24;
  }

  // ---- Total -------------------------------------------------------------
  ensureRoom(ctx, 90);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - 44,
    width: CONTENT_W,
    height: 52,
    color: BARK,
  });
  ctx.page.drawText('QUOTED TOTAL', {
    x: MARGIN + 14,
    y: ctx.y - 12,
    size: 8,
    font: bold,
    color: rgb(0.914, 0.906, 0.114),
  });
  const total = formatCents(order.totalCents);
  ctx.page.drawText(total, {
    x: MARGIN + 14,
    y: ctx.y - 34,
    size: 20,
    font: bold,
    color: rgb(1, 0.973, 0.925),
  });
  if (order.needsQuoteCount > 0) {
    const note = `+ ${order.needsQuoteCount} line${
      order.needsQuoteCount === 1 ? '' : 's'
    } for Bratt to quote`;
    ctx.page.drawText(note, {
      x: PAGE_W - MARGIN - 14 - body.widthOfTextAtSize(note, 9),
      y: ctx.y - 26,
      size: 9,
      font: body,
      color: rgb(1, 0.973, 0.925),
    });
  }
  ctx.y -= 68;

  // ---- Footer ------------------------------------------------------------
  ensureRoom(ctx, 60);
  for (const line of wrap(
    `Prices cover a full year of treatment; where a treatment includes multiple sprays, all are included. ` +
      `Lines marked "Bratt to quote" are off the standard chart and will be priced by Bratt before scheduling. ` +
      `Accepted by ${PARTNER.name} on ${dateLine}.`,
    body,
    8.5,
    CONTENT_W,
  )) {
    text(ctx, line, { size: 8.5, color: GREY });
    ctx.y -= 12;
  }

  // Partnership credit, in their green, closing the ORDER — drawn here, before
  // the appendix. It used to be emitted after drawPhotoAppendix(), which had
  // already moved ctx to a photo page, so the credit landed on top of a photo
  // caption. Anything that writes to ctx must run before the appendix takes over.
  ctx.y -= 8;
  text(
    ctx,
    `${PROGRAM.name} — ${BRATT.name} in partnership with ${PARTNER.name}`,
    { size: 8, bold: true, color: PARTNER_DARK },
  );

  // ---- Photo appendix ----------------------------------------------------
  // The inline thumbnails are for orientation while reading the order; they are
  // far too small to judge a canopy or read leaf damage. So every photo also gets
  // rendered large on its own appendix page, captioned with the tree it belongs
  // to and its measurements. Same embedded image either way — pdf-lib reuses the
  // embed, so the large copy costs no extra bytes.
  await drawPhotoAppendix(ctx, order, photos);

  return doc.save();
}

/** One page per photo, as large as the page allows, with a caption. */
async function drawPhotoAppendix(
  ctx: Ctx,
  order: WorkOrder,
  photos: Map<string, Uint8Array>,
): Promise<void> {
  const withPhotos = order.trees.filter((t) =>
    t.photos.some((p) => photos.has(p.id)),
  );
  if (withPhotos.length === 0) return;

  // Section divider, so the appendix doesn't look like a stray page.
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 76,
    width: PAGE_W,
    height: 76,
    color: BARK,
  });
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 82, width: PAGE_W, height: 6, color: ORANGE });
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 85, width: PAGE_W, height: 3, color: PARTNER_ACCENT });
  ctx.page.drawText('TREE PHOTOS', {
    x: MARGIN,
    y: PAGE_H - 44,
    size: 18,
    font: ctx.bold,
    color: CREAM,
  });
  // Partner mark here too, so a page torn out of the middle still reads as
  // coming from the partnership rather than from nowhere.
  const appendixLogo = await tryEmbed(
    ctx.doc,
    (await loadPartnerLogo()) ?? new Uint8Array(),
  );
  if (appendixLogo) {
    const h = 22;
    const w = (appendixLogo.width / appendixLogo.height) * h;
    ctx.page.drawRectangle({
      x: PAGE_W - MARGIN - w - 14,
      y: PAGE_H - 30 - h - 6,
      width: w + 14,
      height: h + 12,
      color: rgb(1, 1, 1),
    });
    ctx.page.drawImage(appendixLogo, {
      x: PAGE_W - MARGIN - w - 7,
      y: PAGE_H - 30 - h,
      width: w,
      height: h,
    });
  }
  ctx.page.drawText(
    `${order.proposal.reference}  ·  full-size images for review`,
    {
      x: MARGIN,
      y: PAGE_H - 64,
      size: 9,
      font: ctx.body,
      color: rgb(0.914, 0.906, 0.114),
    },
  );
  ctx.y = PAGE_H - 128;

  let firstOnPage = true;

  for (const [treeIndex, tree] of order.trees.entries()) {
    const available = tree.photos
      .map((p) => ({ id: p.id, bytes: photos.get(p.id) }))
      .filter((p): p is { id: string; bytes: Uint8Array } => !!p.bytes);
    if (available.length === 0) continue;

    for (const [photoIndex, photo] of available.entries()) {
      const img = await tryEmbed(ctx.doc, photo.bytes);
      if (!img) continue;

      // A fresh page per photo, except the first which shares the divider page.
      if (!firstOnPage) {
        ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
        ctx.y = PAGE_H - MARGIN;
      }
      firstOnPage = false;

      const caption = `${treeIndex + 1}. ${tree.label}`;
      ctx.page.drawText(caption, {
        x: MARGIN,
        y: ctx.y - 12,
        size: 13,
        font: ctx.bold,
        color: INK,
      });

      const detail = [
        tree.species ?? 'Species not noted',
        `${tree.dbh}" DBH`,
        tree.heightFt != null ? `${tree.heightFt} ft tall` : null,
        tree.crownSpreadFt != null ? `${tree.crownSpreadFt} ft spread` : null,
        available.length > 1 ? `photo ${photoIndex + 1} of ${available.length}` : null,
      ]
        .filter(Boolean)
        .join('  ·  ');
      ctx.page.drawText(detail, {
        x: MARGIN,
        y: ctx.y - 30,
        size: 9,
        font: ctx.body,
        color: GREY,
      });

      // Fit the image to the space left, preserving aspect ratio, and centre it.
      const boxTop = ctx.y - 50;
      const boxH = boxTop - MARGIN;
      const boxW = CONTENT_W;
      const scale = Math.min(boxW / img.width, boxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;

      ctx.page.drawImage(img, {
        x: MARGIN + (boxW - w) / 2,
        y: boxTop - h,
        width: w,
        height: h,
      });

      // Hairline frame, so a pale sky doesn't bleed into the page edge.
      ctx.page.drawRectangle({
        x: MARGIN + (boxW - w) / 2,
        y: boxTop - h,
        width: w,
        height: h,
        borderColor: RULE,
        borderWidth: 0.75,
      });
    }
  }
}

/** JPEG first, then PNG. Returns null if neither works. */
async function tryEmbed(doc: PDFDocument, bytes: Uint8Array) {
  try {
    return await doc.embedJpg(bytes);
  } catch {
    try {
      return await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

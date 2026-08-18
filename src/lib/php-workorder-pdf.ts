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

// Bratt brand colors, as pdf-lib rgb (0–1 floats).
const ORANGE = rgb(0.922, 0.298, 0.106); // #EB4C1B
const BARK = rgb(0.149, 0.098, 0.055); // #26190E
const INK = rgb(0.102, 0.055, 0.02); // #1A0E05
const GREY = rgb(0.42, 0.38, 0.33);
const RULE = rgb(0.91, 0.86, 0.75);

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

  // ---- Header band -------------------------------------------------------
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 96,
    width: PAGE_W,
    height: 96,
    color: BARK,
  });
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 102, width: PAGE_W, height: 6, color: ORANGE });

  ctx.page.drawText(BRATT.name.toUpperCase(), {
    x: MARGIN,
    y: PAGE_H - 46,
    size: 20,
    font: bold,
    color: rgb(1, 0.973, 0.925),
  });
  ctx.page.drawText(`${PROGRAM.name.toUpperCase()}  ·  WORK ORDER`, {
    x: MARGIN,
    y: PAGE_H - 66,
    size: 9,
    font: bold,
    color: rgb(0.914, 0.906, 0.114),
  });
  ctx.page.drawText(`PREPARED FOR ${PARTNER.name.toUpperCase()}`, {
    x: MARGIN,
    y: PAGE_H - 82,
    size: 7.5,
    font: body,
    color: rgb(1, 0.973, 0.925),
  });

  // Reference + revision, right-aligned.
  const ref = `${proposal.reference}${proposal.revision > 1 ? ` · REV ${proposal.revision}` : ''}`;
  ctx.page.drawText(ref, {
    x: PAGE_W - MARGIN - bold.widthOfTextAtSize(ref, 13),
    y: PAGE_H - 46,
    size: 13,
    font: bold,
    color: rgb(1, 0.973, 0.925),
  });
  const dateLine = sentAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  ctx.page.drawText(dateLine, {
    x: PAGE_W - MARGIN - body.widthOfTextAtSize(dateLine, 9),
    y: PAGE_H - 64,
    size: 9,
    font: body,
    color: rgb(1, 0.973, 0.925),
  });

  ctx.y = PAGE_H - 130;

  // ---- Job block ---------------------------------------------------------
  text(ctx, proposal.jobName, { size: 16, bold: true });
  ctx.y -= 18;
  text(ctx, proposal.formattedAddress ?? proposal.siteAddress, { size: 10, color: GREY });
  ctx.y -= 14;
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
  ctx.y -= 22;

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

    text(ctx, `${i + 1}. ${tree.label}`, { size: 12, bold: true });
    ctx.y -= 15;

    const dims = [
      tree.species ?? 'Species not noted',
      `${tree.dbh}" DBH`,
      tree.heightFt != null ? `${tree.heightFt} ft tall` : null,
      tree.crownSpreadFt != null ? `${tree.crownSpreadFt} ft spread` : null,
    ]
      .filter(Boolean)
      .join('  ·  ');
    text(ctx, dims, { size: 9, color: GREY });
    ctx.y -= 16;

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
        ctx.y -= 13;
      }
      if (tr.needsQuote && tr.quoteNote) {
        for (const line of wrap(tr.quoteNote, body, 8, CONTENT_W - 24)) {
          text(ctx, line, { size: 8, color: ORANGE, x: MARGIN + 18 });
          ctx.y -= 10;
        }
      }
    }

    if (tree.treatments.length === 0) {
      text(ctx, '• No treatment selected', { size: 10, color: ORANGE, x: MARGIN + 8 });
      ctx.y -= 13;
    }

    if (tree.notes) {
      ctx.y -= 2;
      for (const line of wrap(`Notes: ${tree.notes}`, body, 9, CONTENT_W - 16)) {
        text(ctx, line, { size: 9, color: GREY, x: MARGIN + 8 });
        ctx.y -= 11;
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

    ctx.y -= 10;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y },
      end: { x: PAGE_W - MARGIN, y: ctx.y },
      thickness: 0.5,
      color: RULE,
    });
    ctx.y -= 20;
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
      `Lines marked "Bratt to quote" are off the standard chart and will be priced by ${BRATT.contactName} before scheduling. ` +
      `Accepted by ${PARTNER.name} on ${dateLine}.`,
    body,
    8.5,
    CONTENT_W,
  )) {
    text(ctx, line, { size: 8.5, color: GREY });
    ctx.y -= 11;
  }

  return doc.save();
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

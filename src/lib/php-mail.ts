// ============================================================================
// Plant Health Program — sending the work order to Bratt (SERVER ONLY)
// ============================================================================
// Gmail SMTP with an app password, matching how magic-link email already leaves
// this project. Not a transactional ESP (Resend, Postmark, SES): those all want
// DNS records on brattree.com to send as our domain, and we don't control that
// DNS. One work order email per job, a handful of jobs a week — Gmail's limits
// are nowhere near a problem at this scale.
//
// Required environment variables:
//   PHP_GMAIL_USER          the sending Gmail address
//   PHP_GMAIL_APP_PASSWORD  a Google App Password (NOT the account password)
//   PHP_ORDER_EMAIL         where work orders go — REQUIRED, no default
//
// PHP_ORDER_EMAIL has no fallback on purpose. An unset destination used to
// default to an individual's address, which meant a misconfigured deploy could
// quietly mail a customer's work order to a person who wasn't expecting it.
// Refusing to send is the safe failure: nothing is lost, because the work order
// and its PDF are already stored and the rep is told to have it configured.
//
// Whatever is missing, sendWorkOrderEmail reports a failure rather than throwing:
// the send itself already succeeded, so the partner should be told "saved, but
// the email didn't go" rather than losing the work order.
// ============================================================================

import nodemailer from 'nodemailer';
import { PARTNER, PROGRAM } from './partner-config';
import { formatCents } from './php-quote';
import type { WorkOrder } from './partner-types';

export type MailResult =
  | { ok: true; to: string }
  | { ok: false; to: string | null; error: string };

/**
 * Where work orders go. Null when unconfigured — never a person's address as a
 * fallback (see the note at the top of this file).
 */
export function orderEmailAddress(): string | null {
  return process.env.PHP_ORDER_EMAIL?.trim() || null;
}

function plainBody(order: WorkOrder): string {
  const { proposal } = order;
  const lines: string[] = [
    `${PROGRAM.name} work order from ${PARTNER.name}`,
    '',
    `Reference:   ${proposal.reference}${proposal.revision > 1 ? ` (revision ${proposal.revision})` : ''}`,
    `Job:         ${proposal.jobName}`,
    `Site:        ${proposal.formattedAddress ?? proposal.siteAddress}`,
  ];

  if (!proposal.formattedAddress) {
    lines.push('             ** address not confirmed against the map **');
  }
  if (proposal.salespersonName) {
    lines.push(`Salesperson: ${proposal.salespersonName}`);
  }
  if (proposal.latitude != null && proposal.longitude != null) {
    lines.push(
      `Map:         https://www.google.com/maps/search/?api=1&query=${proposal.latitude},${proposal.longitude}`,
    );
  }

  lines.push('', `${order.trees.length} tree${order.trees.length === 1 ? '' : 's'}:`, '');

  for (const [i, tree] of order.trees.entries()) {
    const dims = [
      tree.species ?? 'species not noted',
      `${tree.dbh}" DBH`,
      tree.heightFt != null ? `${tree.heightFt} ft` : null,
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`${i + 1}. ${tree.label} — ${dims}`);
    for (const tr of tree.treatments) {
      const price = tr.needsQuote
        ? `BRATT TO QUOTE${tr.quoteNote ? ` — ${tr.quoteNote}` : ''}`
        : formatCents(tr.unitPriceCents ?? 0);
      lines.push(`     - ${tr.serviceName ?? tr.serviceId}: ${price}`);
    }
    if (tree.notes) lines.push(`     notes: ${tree.notes}`);
    lines.push('');
  }

  lines.push(
    `Quoted total: ${formatCents(order.totalCents)}`,
    order.needsQuoteCount > 0
      ? `Plus ${order.needsQuoteCount} line${order.needsQuoteCount === 1 ? '' : 's'} to be priced by hand.`
      : '',
    '',
    'The full work order, including tree photos, is attached as a PDF.',
  );

  return lines.filter((l) => l !== undefined).join('\n');
}

/**
 * Emails the work order PDF to Bratt.
 *
 * Never throws. The caller has already stored the work order and its PDF, so a
 * mail failure needs to be reported and retried, not allowed to unwind a send
 * that otherwise succeeded.
 */
export async function sendWorkOrderEmail(
  order: WorkOrder,
  pdf: Uint8Array,
): Promise<MailResult> {
  const user = process.env.PHP_GMAIL_USER?.trim();
  const pass = process.env.PHP_GMAIL_APP_PASSWORD?.trim();
  const to = orderEmailAddress();

  if (!to) {
    return {
      ok: false,
      to: null,
      error:
        'No delivery address is configured — set PHP_ORDER_EMAIL in Vercel. The work order and its PDF are saved.',
    };
  }
  if (!user || !pass) {
    return {
      ok: false,
      to,
      error:
        'Email sending is not configured yet — set PHP_GMAIL_USER and PHP_GMAIL_APP_PASSWORD in Vercel. The work order and its PDF are saved.',
    };
  }

  const { proposal } = order;
  const subject =
    `[${PROGRAM.name}] ${proposal.reference} — ${proposal.jobName}` +
    (proposal.revision > 1 ? ` (rev ${proposal.revision})` : '');

  try {
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transport.sendMail({
      from: `"${PARTNER.name} via ${PROGRAM.name}" <${user}>`,
      to,
      subject,
      text: plainBody(order),
      attachments: [
        {
          filename: `${proposal.reference}-work-order.pdf`,
          content: Buffer.from(pdf),
          contentType: 'application/pdf',
        },
      ],
    });

    return { ok: true, to };
  } catch (e) {
    return {
      ok: false,
      to,
      error: e instanceof Error ? e.message : 'Sending failed.',
    };
  }
}

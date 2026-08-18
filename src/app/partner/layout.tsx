import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PROGRAM, PARTNER, PARTNER_COLORS, BRATT } from '@/lib/partner-config';
import { PARTNER_COOKIE, isValidPartnerCookie } from '@/lib/partner-auth';
import { PartnerLogo } from '@/components/partner/PartnerLogo';

export const metadata: Metadata = {
  title: `${PROGRAM.name} — ${BRATT.name}`,
  description: `Plant Health Care proposals from ${BRATT.name}.`,
};

/**
 * The Plant Health Program shell.
 *
 * BRATT-BRANDED on purpose: the partner's reps are selling our tree work, and
 * the homeowner needs to see who is actually treating their trees. So this uses
 * the real brand furniture — mascot, orange ribbon, cream paper, Rugfish
 * display type — exactly as the rest of the app does.
 *
 * Landscapes Unlimited appears as a hint, not a co-equal: their logo sits in the
 * header under a "prepared for" credit, and their green shows up on a thin rule
 * and the handoff chip. Their brand should feel acknowledged, not in charge.
 *
 * What this shell deliberately does NOT include is the internal nav. The root
 * layout drops BrandHeader (role-based dropdowns into Pace, Crew, Admin…) for
 * this area via the `x-bt-area` header middleware sets, and we render our own
 * header instead. The TrustRibbon is shared with the rest of the site.
 */
export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const signedIn = await isValidPartnerCookie(jar.get(PARTNER_COOKIE)?.value);

  return (
    <div
      className="partner-theme flex min-h-screen flex-col bg-cream text-ink"
      style={
        {
          '--php-dark': PARTNER_COLORS.dark,
          '--php-accent': PARTNER_COLORS.accent,
        } as React.CSSProperties
      }
    >
      {/* Bratt header — mascot + logotype, same furniture as the main site. */}
      <header className="bt-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          {/* The badge logo carries its own dark panel and lime halo, so it
              sits on the bark header unmodified. No filters — inverting it
              flattens the artwork to a white blob. */}
          <Link href="/partner" className="flex items-center gap-4">
            <Image
              src="/brand/logotype.png"
              alt={BRATT.name}
              width={160}
              height={128}
              className="h-14 w-auto"
              priority
            />
            <span className="h-9 w-px bg-cream/25" aria-hidden="true" />
            <span className="font-headline text-sm font-extrabold uppercase tracking-ribbon text-lime">
              {PROGRAM.name}
            </span>
          </Link>

          <div className="flex items-center gap-5">
            {/* The Landscapes Unlimited hint. */}
            <div className="hidden flex-col items-end gap-1 sm:flex">
              <span className="font-headline text-[0.6rem] font-extrabold uppercase tracking-ribbon text-cream/60">
                Prepared for
              </span>
              <span className="rounded bg-white px-2 py-1">
                <PartnerLogo className="h-4" />
              </span>
            </div>

            {signedIn && (
              <form method="post" action="/partner/session">
                <input type="hidden" name="intent" value="signout" />
                <button
                  type="submit"
                  className="font-headline text-xs font-extrabold uppercase tracking-ribbon text-cream/70 hover:text-lime"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      {/* Trust strip, same as the rest of the site but tuned to PHC work —
          applicator licensing is the credential that matters for treatments. */}
      <div className="bt-ribbon">
        <div className="mx-auto max-w-6xl px-4 py-2 text-center sm:px-6">
          <span className="sm:hidden">LICENSED APPLICATORS &middot; ISA-CERTIFIED</span>
          <span className="hidden sm:inline">
            FAMILY-OWNED SINCE 1991 &nbsp;&middot;&nbsp; LICENSED APPLICATORS
            &nbsp;&middot;&nbsp; INSURED &nbsp;&middot;&nbsp; ISA-CERTIFIED
            &nbsp;&middot;&nbsp; SATISFACTION GUARANTEED
          </span>
        </div>
      </div>

      {/* The partner's green, as a hairline. Their only structural presence. */}
      <div className="php-partner-rule h-1" aria-hidden="true" />

      <div className="flex-1">{children}</div>

      <footer className="mt-10 bg-bark text-cream/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <p className="max-w-md text-xs">
            Tree work performed by {BRATT.name} &mdash; licensed, insured, and
            ISA-Certified. Questions on a treatment or an unusual tree?{' '}
            <a
              href={`mailto:${BRATT.contactEmail}`}
              className="font-bold text-lime hover:underline"
            >
              Ask {BRATT.contactName}
            </a>
            .
          </p>
          <p className="font-headline text-[0.6rem] font-extrabold uppercase tracking-ribbon text-cream/50">
            {PROGRAM.name} &nbsp;&middot;&nbsp; for {PARTNER.name}
          </p>
        </div>
      </footer>
    </div>
  );
}

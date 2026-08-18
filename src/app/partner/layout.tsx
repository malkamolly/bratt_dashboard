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
      {/* Header: a two-brand lockup, both marks visible at every width.
          The partner logo used to be `hidden sm:flex`, which meant the phone —
          where their reps actually work — showed only Bratt. Now both show
          always; the program name is what drops on the narrowest screens. */}
      <header className="bt-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/partner" className="flex min-w-0 items-center gap-3 sm:gap-4">
            {/* The badge carries its own dark panel and lime halo, so it sits on
                the bark header unmodified — no filters. */}
            <Image
              src="/brand/logotype.png"
              alt={BRATT.name}
              width={160}
              height={128}
              className="h-12 w-auto flex-shrink-0 sm:h-16"
              priority
            />

            {/* Their green as the divider — the join between the two brands. */}
            <span
              className="h-9 w-[3px] flex-shrink-0 rounded-full sm:h-11"
              style={{ backgroundColor: PARTNER_COLORS.accent }}
              aria-hidden="true"
            />

            {/* Their mark on a white chip: it's dark green on transparent and
                would vanish against the bark panel. Sized off the TRIMMED asset,
                so this is 26-32px of actual wordmark rather than mostly padding,
                and the chip hugs it instead of floating around it. */}
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="hidden font-headline text-[0.55rem] font-extrabold uppercase tracking-ribbon text-cream/45 sm:block">
                In partnership with
              </span>
              <span className="inline-flex items-center rounded-2 bg-white px-2.5 py-1.5 shadow-sh-1">
                <PartnerLogo className="h-[26px] sm:h-8" />
              </span>
            </span>
          </Link>

          <div className="flex flex-shrink-0 items-center gap-4">
            <span className="hidden font-headline text-xs font-extrabold uppercase tracking-ribbon text-lime lg:block">
              {PROGRAM.name}
            </span>
            {signedIn && (
              <form method="post" action="/partner/session">
                <input type="hidden" name="intent" value="signout" />
                <button
                  type="submit"
                  className="font-headline text-[0.65rem] font-extrabold uppercase tracking-ribbon text-cream/70 hover:text-lime sm:text-xs"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>

        {/* On phones and tablets the program name moves to its own line rather
            than being dropped, so the tool still says what it is. */}
        <div className="border-t border-cream/10 px-4 pb-2 pt-1.5 lg:hidden">
          <p className="mx-auto max-w-6xl font-headline text-[0.6rem] font-extrabold uppercase tracking-ribbon text-lime">
            {PROGRAM.name}
          </p>
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
          {/* No email address here on purpose — see the note in
              partner-config.ts. Their reps reach us through their own Bratt
              contact, not an inbox this tool advertises. */}
          <p className="max-w-md text-xs">
            Tree work performed by {BRATT.name} &mdash; licensed, insured, and
            ISA-Certified. Questions on a treatment or an unusual tree? Reach out
            to your Bratt Tree contact.
          </p>
          <div className="flex items-center gap-3">
            <span className="font-headline text-[0.6rem] font-extrabold uppercase tracking-ribbon text-cream/50">
              {PROGRAM.name}
            </span>
            <span className="inline-flex items-center rounded-2 bg-white px-2.5 py-1.5">
              <PartnerLogo className="h-6" />
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PROGRAM, PARTNER, PARTNER_COLORS, BRATT } from '@/lib/partner-config';
import { PARTNER_COOKIE, isValidPartnerCookie } from '@/lib/partner-auth';
import { PartnerLogo } from '@/components/partner/PartnerLogo';

export const metadata: Metadata = {
  title: `${PROGRAM.name} — ${PARTNER.name}`,
  description: `${PROGRAM.name}: tree health proposals, powered by ${BRATT.name}.`,
};

/**
 * The Plant Health Program shell. CO-branded: the partner's logo leads, Bratt
 * appears as the service provider. None of our internal chrome — the root
 * layout drops BrandHeader + TrustRibbon for this area based on the `x-bt-area`
 * header middleware sets.
 *
 * The brand palette is injected here as CSS variables so globals.css and every
 * page below read one source of truth (PARTNER_COLORS in partner-config.ts).
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
      className="partner-theme flex min-h-screen flex-col bg-slate-50 text-slate-900"
      style={
        {
          '--php-dark': PARTNER_COLORS.dark,
          '--php-darker': PARTNER_COLORS.darker,
          '--php-accent': PARTNER_COLORS.accent,
        } as React.CSSProperties
      }
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/partner" className="flex items-center gap-4">
            <PartnerLogo />
            <span
              className="hidden h-8 w-px sm:block"
              style={{ backgroundColor: '#e2e8f0' }}
              aria-hidden="true"
            />
            <span className="hidden flex-col leading-tight sm:flex">
              <span
                className="text-sm font-bold"
                style={{ color: PARTNER_COLORS.dark }}
              >
                {PROGRAM.name}
              </span>
              <span className="text-xs text-slate-500">{PROGRAM.tagline}</span>
            </span>
          </Link>

          {signedIn && (
            <form method="post" action="/partner/session">
              <input type="hidden" name="intent" value="signout" />
              <button
                type="submit"
                className="text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <p className="text-xs text-slate-500">
            {PROGRAM.name} is delivered by {BRATT.name} for {PARTNER.name}.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400">
              Tree work by
            </span>
            <Image
              src="/brand/logotype.png"
              alt={BRATT.name}
              width={96}
              height={24}
              className="h-5 w-auto opacity-70"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

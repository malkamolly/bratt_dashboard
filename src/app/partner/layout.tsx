import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PARTNER } from '@/lib/partner-config';
import { PARTNER_COOKIE, isValidPartnerCookie } from '@/lib/partner-auth';

export const metadata: Metadata = {
  title: `${PARTNER.name} — Plant Health Care Pricing`,
  description: 'Plant Health Care pricing calculator.',
};

/**
 * The Partner Hub shell. Its own plain header — no Bratt mascot, no internal
 * nav, no links back into the dashboard. The internal Bratt chrome (BrandHeader
 * + TrustRibbon) is suppressed for this whole area by the root layout, which
 * reads the `x-bt-area` header that middleware sets on /partner requests.
 */
export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const signedIn = await isValidPartnerCookie(jar.get(PARTNER_COOKIE)?.value);

  return (
    <div className="partner-theme min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/partner" className="flex flex-col leading-tight">
            <span className="text-base font-bold text-slate-900">
              {PARTNER.name}
            </span>
            <span className="text-xs text-slate-500">{PARTNER.tagline}</span>
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

      {children}

      <footer className="mx-auto max-w-5xl px-6 py-10 text-xs text-slate-400">
        Plant Health Care services and pricing provided by Bratt Tree Company.
      </footer>
    </div>
  );
}

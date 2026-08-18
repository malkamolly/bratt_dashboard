import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import { BrandHeader } from '@/components/BrandHeader';
import { TrustRibbon } from '@/components/TrustRibbon';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bratt Tree Hub',
  description: 'Internal hub for the Bratt Tree team.',
  icons: { icon: '/brand/mascot-circle.png' },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The external Partner Hub (/partner/*) brings its own plain shell and must
  // show none of our branding or internal nav. Middleware stamps this header on
  // partner requests (and strips it everywhere else, so it can't be spoofed).
  const isPartnerArea = (await headers()).get('x-bt-area') === 'partner';

  return (
    <html lang="en" className={nunito.variable}>
      <body
        className={
          isPartnerArea
            ? 'min-h-screen bg-slate-50 font-sans text-slate-900'
            : 'min-h-screen bg-cream font-sans text-ink'
        }
      >
        {!isPartnerArea && (
          <>
            <BrandHeader />
            <TrustRibbon />
          </>
        )}
        {children}
      </body>
    </html>
  );
}

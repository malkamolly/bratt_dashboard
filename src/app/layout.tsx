import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
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
  title: 'Bratt Tree PACE Dashboard',
  description: 'Daily sales and production pace reporting for Bratt Tree Company.',
  icons: { icon: '/brand/mascot-circle.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-screen bg-cream font-sans text-ink">
        <BrandHeader />
        <TrustRibbon />
        {children}
      </body>
    </html>
  );
}

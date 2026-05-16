import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bratt Tree PACE Dashboard',
  description: 'Daily sales and production pace reporting for Bratt Tree Company.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

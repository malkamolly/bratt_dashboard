/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  outputFileTracingIncludes: {
    '/api/training-deck/**': ['./content/training-modules/**/*.txt'],
    '/crew/modules/**': ['./content/training-modules/**/*.txt'],
    // The Plant Health Program work order PDF draws both logos, and reads them
    // from disk with fs (see src/lib/brand-assets.ts). Without this they aren't
    // in the deployed function bundle and the PDF silently loses its branding.
    '/partner/**': [
      './public/brand/logotype.png',
      './public/brand/partners/**',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = nextConfig;

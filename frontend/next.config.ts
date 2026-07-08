import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProductionBuild = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: isProductionBuild ? 'standalone' : undefined,
  outputFileTracingRoot: repoRoot,
  allowedDevOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
  experimental: {
    // Prevent Next devtools segment explorer from injecting a client module
    // that intermittently goes missing from the RSC client manifest in dev.
    devtoolSegmentExplorer: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/wikipedia/commons/**',
      },
    ],
  },
};

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
    })
  : nextConfig;

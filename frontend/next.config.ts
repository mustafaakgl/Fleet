import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProductionBuild = process.env.NODE_ENV === 'production';
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());

/**
 * Version stamped into the driver portal service worker URL so each deploy
 * installs a new worker and drops the previous cache.
 *
 * Must be identical across every process of one build — `next build` may evaluate
 * this config in several workers, so a timestamp would hand them different values.
 * The commit sha is stable for a build; the package version is the fallback for
 * builds without a git directory (e.g. inside Docker).
 */
function resolveServiceWorkerVersion(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SW_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.env.npm_package_version ?? 'unversioned';
  }
}

const nextConfig: NextConfig = {
  // Allow verify/CI builds to write into an isolated dist dir so they don't
  // clobber the running dev server's .next runtime chunks.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  env: {
    NEXT_PUBLIC_SW_VERSION: resolveServiceWorkerVersion(),
  },
  output: isProductionBuild ? 'standalone' : undefined,
  outputFileTracingRoot: repoRoot,
  // Public demo tunnels (cloudflared) reach the dev server under a foreign
  // Host header; Next 15 rejects those unless they are listed here.
  allowedDevOrigins: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    '*.trycloudflare.com',
    '*.ngrok-free.app',
    '*.ngrok-free.dev',
    '*.ngrok.app',
    '*.ngrok.io',
    '*.ts.net',
  ],
  // Same-origin API proxy so a phone on the public tunnel never has to resolve
  // localhost:3000 itself. Scoped to the backend's global prefix (api/v1) so the
  // frontend's own route handlers (/api/leads, /api/route-map) keep working.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:3000'}/api/v1/:path*`,
      },
    ];
  },
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

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
    })
  : nextConfig;

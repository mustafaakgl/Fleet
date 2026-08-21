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
  /**
   * GIRISSIZ SLOT SAYFASININ GUVENLIK BASLIKLARI (Faz 17g).
   *
   * Yalnizca `/public/delivery-slot` icin: uygulamanin geri kalani Sentry ve
   * harita saglayicisi gibi dis kaynaklara cikiyor ve ayni siki politikayi
   * oraya uygulamak calisan ozellikleri kirardi. Bu sayfanin ise HICBIR dis
   * kaynaga ihtiyaci yok — o yuzden burada siki olabiliyoruz.
   *
   *   `default-src 'self'`     — her sey ayni kaynaktan.
   *   `script-src 'self' 'unsafe-inline'` — ucuncu taraf script YOK. Inline'a
   *       izin veriliyor cunku Next hydration verisini inline script olarak
   *       yaziyor; nonce icin middleware gerekirdi ve asil hedef DIS
   *       kaynaklari kapatmak.
   *   `connect-src 'self'`     — sayfa yalnizca kendi API'sine konusabilir.
   *       Bir analytics ya da hata toplayici, secilen saati disari
   *       TASIYAMAZ.
   *   `frame-ancestors 'none'` — clickjacking ile randevu degistirilemez.
   *   `form-action 'self'`     — form baska bir kaynaga POST edilemez.
   *
   * `Referrer-Policy: no-referrer` — bu adres hicbir dis istekte `Referer`
   * olarak gitmiyor.
   */
  async headers() {
    return [
      {
        source: '/public/delivery-slot',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              /**
               * `'unsafe-eval'` YALNIZCA GELISTIRMEDE.
               *
               * Next'in dev paketleyicisi modulleri `eval` ile yukluyor;
               * uretim derlemesinde bu YOK. Tek bir sabit CSP yazsaydik ya
               * gelistirme sunucusu calismaz ya da uretimde gereksiz bir
               * kapi acik kalirdi. Asil hedef — UCUNCU TARAF kaynaklarini
               * kapatmak — iki modda da aynen gecerli.
               */
              isProductionBuild
                ? "script-src 'self' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
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

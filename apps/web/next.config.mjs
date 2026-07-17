import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const turnstileOrigin = 'https://challenges.cloudflare.com';
const metrikaScriptOrigins = 'https://mc.yandex.ru https://yastatic.net';
const metrikaDataOrigins =
  'https://mc.yandex.ru https://mc.yandex.com https://mc.webvisor.org https://mc.webvisor.com wss://mc.yandex.ru wss://mc.yandex.com wss://mc.webvisor.org wss://mc.webvisor.com';
const metrikaFrameAncestors =
  'https://metrika.yandex.ru https://analytics.yandex.ru https://metr.yandex.ru https://metrica.yandex.ru';

const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').origin;
  } catch {
    return 'http://localhost:4000';
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  `frame-ancestors 'self' ${metrikaFrameAncestors}`,
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data: https://mc.yandex.ru https://mc.yandex.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} ${turnstileOrigin} ${metrikaScriptOrigins}`,
  `connect-src 'self' ${apiOrigin} ${turnstileOrigin} ${metrikaDataOrigins}`,
  `child-src blob: https://mc.yandex.ru`,
  `frame-src blob: ${turnstileOrigin} https://mc.yandex.ru`,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const noIndexHeaders = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repositoryRoot,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/admin/:path*', headers: noIndexHeaders },
      { source: '/advertiser/:path*', headers: noIndexHeaders },
      { source: '/developer/:path*', headers: noIndexHeaders },
      { source: '/account/:path*', headers: noIndexHeaders },
      { source: '/login', headers: noIndexHeaders },
      { source: '/register', headers: noIndexHeaders },
    ];
  },
};

export default nextConfig;

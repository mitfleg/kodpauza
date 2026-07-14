import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { getClientIp } from './http.js';

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function limitForPath(path: string): number {
  if (path === '/v1/auth/register') return config.rateLimitRegister;
  if (path.startsWith('/v1/auth/')) return config.rateLimitAuth;
  if (path.startsWith('/v1/ads/')) return config.rateLimitAds;
  if (path.startsWith('/v1/events/')) return config.rateLimitEvents;
  if (
    path.startsWith('/v1/advertiser/payments') ||
    path.startsWith('/v1/developer/payouts') ||
    path.startsWith('/v1/admin/payouts')
  ) {
    return config.rateLimitPayments;
  }
  return config.rateLimitDefault;
}

function subjectForRequest(request: FastifyRequest): string {
  return getClientIp(request) ?? request.ip ?? 'unknown';
}

function normalizedPath(url: string): string {
  return (url.split('?')[0] ?? url)
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/(?:c[a-z0-9]{20,}|[a-z0-9_-]{24,})(?=\/|$)/gi, '/:id');
}

export async function rateLimit(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === 'OPTIONS' || request.url === '/health') return;

  const now = Date.now();
  const path = normalizedPath(request.url);
  const limit = limitForPath(path);
  const key = `${path}:${subjectForRequest(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    if (buckets.size >= 10_000) pruneRateLimitBuckets();
    if (buckets.size >= 10_000) buckets.delete(buckets.keys().next().value as string);
    buckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
    return;
  }

  current.count += 1;
  if (current.count <= limit) return;

  const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  reply.header('Retry-After', String(retryAfterSec));
  return reply.code(429).send({ error: 'Слишком много запросов. Попробуйте позже.' });
}

export function pruneRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

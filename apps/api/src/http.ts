import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { config } from './config.js';

export function hashNullable(value: string | undefined): string | null {
  if (!value) return null;
  return crypto.createHmac('sha256', config.ipHashSecret).update(value).digest('hex');
}

export function getClientIp(request: FastifyRequest): string | undefined {
  return request.ip;
}

import type { FastifyInstance } from 'fastify';
import { createRuntimePolicyEnvelope } from '../services/runtimePolicy.js';

export function registerRuntimePolicyRoutes(app: FastifyInstance) {
  app.get('/v1/runtime-policy', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0');
    return createRuntimePolicyEnvelope();
  });
}

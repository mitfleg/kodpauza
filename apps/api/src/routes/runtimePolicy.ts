import type { FastifyInstance } from 'fastify';
import {
  createExtensionUpdateEnvelope,
  loadExtensionUpdateArtifact,
} from '../services/extensionUpdate.js';
import { createRuntimePolicyEnvelope } from '../services/runtimePolicy.js';

export function registerRuntimePolicyRoutes(app: FastifyInstance) {
  app.get('/v1/runtime-policy', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0');
    return createRuntimePolicyEnvelope();
  });

  app.get('/v1/extension/update', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0');
    try {
      return await createExtensionUpdateEnvelope();
    } catch (error) {
      app.log.warn({ error }, 'Unable to create the extension update manifest.');
      return reply.code(503).send({ error: 'Манифест обновления временно недоступен.' });
    }
  });

  app.get<{ Params: { version: string } }>('/v1/extension/download/:version', async (request, reply) => {
    try {
      const artifact = await loadExtensionUpdateArtifact();
      if (request.params.version !== artifact.version) {
        return reply.code(404).send({ error: 'Версия пакета не найдена.' });
      }
      reply.header('Cache-Control', 'public, max-age=300, immutable');
      reply.header('Content-Type', 'application/octet-stream');
      reply.header(
        'Content-Disposition',
        `attachment; filename="kodpauza-${artifact.version}.vsix"`,
      );
      return reply.send(artifact.bytes);
    } catch (error) {
      app.log.warn({ error }, 'Unable to serve the extension update artifact.');
      return reply.code(503).send({ error: 'Пакет обновления временно недоступен.' });
    }
  });
}

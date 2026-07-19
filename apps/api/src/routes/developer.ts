import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';
import type { AdminNotifier } from '../services/adminNotifier.js';
import { classifyUnsupportedIntegrationVersion } from '../services/integrationVersionPolicy.js';

export const patchStatusSchema = z.enum([
  'installed_exact',
  'installed_structural',
  'not_installed',
  'unsupported',
  'error',
  'unknown',
]);

export const patchErrorCategorySchema = z.enum([
  'compatibility',
  'filesystem',
  'permission',
  'verification',
  'runtime',
  'unknown',
]);

export const extensionInstallSchema = z.object({
  installId: z.string().uuid(),
  vscodeVersion: z.string().trim().min(1).max(40),
  extensionVersion: z.string().trim().min(1).max(40),
  os: z.string().trim().min(1).max(40),
  integrationsEnabled: z.boolean(),
  codexDetected: z.boolean(),
  claudeDetected: z.boolean(),
  heartbeatSchemaVersion: z.number().int().min(1).max(10).optional(),
  editorName: z.string().trim().min(1).max(80).optional(),
  codexVersion: z.string().trim().min(1).max(40).optional(),
  claudeVersion: z.string().trim().min(1).max(40).optional(),
  codexPatchStatus: patchStatusSchema.optional(),
  claudePatchStatus: patchStatusSchema.optional(),
  codexPatchErrorCategory: patchErrorCategorySchema.nullable().optional(),
  claudePatchErrorCategory: patchErrorCategorySchema.nullable().optional(),
}).strict();

const ALERT_RETRY_DELAY_MS = 10 * 60 * 1000;

const eventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(50).default(10),
}).strict();

const versionReportPayloadSchema = z.object({
  version: z.string().trim().regex(/^\d+(?:\.\d+){2,3}$/).max(40),
  supported: z.boolean(),
  compatibilityMode: z.enum(['exact', 'structural', 'unsupported']).optional(),
  clientVersion: z.string().trim().min(1).max(40),
  editorName: z.string().trim().min(1).max(80),
}).strict();

const integrationVersionReportSchema = versionReportPayloadSchema.extend({
  tool: z.enum(['codex', 'claude']),
}).strict();

type VersionReportPayload = z.infer<typeof versionReportPayloadSchema>;

export function registerDeveloperRoutes(app: FastifyInstance, adminNotifier: AdminNotifier) {
  app.put(
    '/v1/developer/extension-install',
    { preHandler: requireRole('developer') },
    async (request, reply) => {
      const parsed = extensionInstallSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Некорректные данные установки расширения.' });
      }
      const now = new Date();
      const existing = await prisma.extensionInstall.findUnique({
        where: { installId: parsed.data.installId },
        select: { userId: true },
      });
      if (existing && existing.userId !== request.authUser!.id) {
        return reply.code(409).send({ error: 'Эта установка уже привязана к другому аккаунту.' });
      }
      await prisma.extensionInstall.upsert({
        where: { installId: parsed.data.installId },
        create: {
          userId: request.authUser!.id,
          ...parsed.data,
          lastSeenAt: now,
        },
        update: {
          userId: request.authUser!.id,
          vscodeVersion: parsed.data.vscodeVersion,
          extensionVersion: parsed.data.extensionVersion,
          os: parsed.data.os,
          integrationsEnabled: parsed.data.integrationsEnabled,
          codexDetected: parsed.data.codexDetected,
          claudeDetected: parsed.data.claudeDetected,
          ...(parsed.data.heartbeatSchemaVersion !== undefined
            ? { heartbeatSchemaVersion: parsed.data.heartbeatSchemaVersion }
            : {}),
          ...(parsed.data.editorName !== undefined ? { editorName: parsed.data.editorName } : {}),
          ...(!parsed.data.codexDetected
            ? {
                codexVersion: null,
                codexPatchStatus: null,
                codexPatchErrorCategory: null,
              }
            : parsed.data.codexVersion !== undefined
            ? { codexVersion: parsed.data.codexVersion }
            : {}),
          ...(!parsed.data.claudeDetected
            ? {
                claudeVersion: null,
                claudePatchStatus: null,
                claudePatchErrorCategory: null,
              }
            : parsed.data.claudeVersion !== undefined
            ? { claudeVersion: parsed.data.claudeVersion }
            : {}),
          ...(parsed.data.codexDetected && parsed.data.codexPatchStatus !== undefined
            ? { codexPatchStatus: parsed.data.codexPatchStatus }
            : {}),
          ...(parsed.data.claudeDetected && parsed.data.claudePatchStatus !== undefined
            ? { claudePatchStatus: parsed.data.claudePatchStatus }
            : {}),
          ...(parsed.data.codexDetected && parsed.data.codexPatchStatus !== undefined
            ? {
                codexPatchErrorCategory:
                  parsed.data.codexPatchStatus === 'error'
                    ? (parsed.data.codexPatchErrorCategory ?? 'unknown')
                    : null,
              }
            : parsed.data.codexDetected && parsed.data.codexPatchErrorCategory !== undefined
              ? { codexPatchErrorCategory: parsed.data.codexPatchErrorCategory }
              : {}),
          ...(parsed.data.claudeDetected && parsed.data.claudePatchStatus !== undefined
            ? {
                claudePatchErrorCategory:
                  parsed.data.claudePatchStatus === 'error'
                    ? (parsed.data.claudePatchErrorCategory ?? 'unknown')
                    : null,
              }
            : parsed.data.claudeDetected && parsed.data.claudePatchErrorCategory !== undefined
              ? { claudePatchErrorCategory: parsed.data.claudePatchErrorCategory }
              : {}),
          lastSeenAt: now,
        },
      });
      return reply.code(204).send();
    },
  );
  app.get('/v1/developer/balance', { preHandler: requireRole('developer') }, async (request) => {
    const profile = await prisma.developerProfile.findUnique({ where: { userId: request.authUser!.id } });
    return {
      balanceKopecks: profile?.balanceKopecks ?? 0,
      totalImpressions: profile?.totalImpressions ?? 0,
      totalClicks: profile?.totalClicks ?? 0,
      payoutStatus: profile?.payoutStatus ?? 'mock',
    };
  });

  app.get('/v1/developer/stats', { preHandler: requireRole('developer') }, async (request) => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const events = await prisma.adEvent.findMany({
      where: { userId: request.authUser!.id, fraudStatus: 'clean', createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, type: true, rewardKopecks: true },
    });

    const byDay = new Map<string, { date: string; impressions: number; clicks: number; rewardKopecks: number }>();
    for (const event of events) {
      const date = event.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(date) ?? { date, impressions: 0, clicks: 0, rewardKopecks: 0 };
      if (event.type === 'impression') row.impressions += 1;
      if (event.type === 'click') row.clicks += 1;
      row.rewardKopecks += event.rewardKopecks;
      byDay.set(date, row);
    }

    return { days: [...byDay.values()] };
  });

  app.get('/v1/developer/events', { preHandler: requireRole('developer') }, async (request, reply) => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница журнала.' });
    const { page, pageSize } = parsed.data;
    const where = { userId: request.authUser!.id };
    const [events, total] = await prisma.$transaction([
      prisma.adEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          eventId: true,
          adId: true,
          type: true,
          surface: true,
          visibleMs: true,
          rewardKopecks: true,
          clientVersion: true,
          toolName: true,
          toolVersion: true,
          fraudStatus: true,
          createdAt: true,
          campaign: { select: { name: true, text: true } },
        },
      }),
      prisma.adEvent.count({ where }),
    ]);

    return {
      events,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  });

  app.post('/v1/developer/integrations/codex/version-report', { preHandler: requireRole('developer') }, async (request, reply) => {
    const parsed = versionReportPayloadSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректные данные версии Codex.' });
    return saveIntegrationVersionReport('codex', parsed.data, request, reply, adminNotifier);
  });

  app.post('/v1/developer/integrations/version-report', { preHandler: requireRole('developer') }, async (request, reply) => {
    const parsed = integrationVersionReportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректные данные версии интеграции.' });
    const { tool, ...payload } = parsed.data;
    return saveIntegrationVersionReport(tool, payload, request, reply, adminNotifier);
  });
}

async function saveIntegrationVersionReport(
  tool: 'codex' | 'claude',
  data: VersionReportPayload,
  request: FastifyRequest,
  reply: FastifyReply,
  adminNotifier: AdminNotifier,
) {
  const now = new Date();
  const compatibilityMode = data.compatibilityMode ?? (data.supported ? 'exact' : 'unsupported');
  const unique = { tool, version: data.version };
  const existing = await prisma.integrationVersionReport.findUnique({
    where: { tool_version: unique },
  });
  const report = await prisma.integrationVersionReport.upsert({
    where: { tool_version: unique },
    create: { tool, ...data, compatibilityMode, firstSeenAt: now, lastSeenAt: now },
    update: {
      supported: data.supported,
      compatibilityMode,
      clientVersion: data.clientVersion,
      editorName: data.editorName,
      lastSeenAt: now,
      reportCount: { increment: 1 },
    },
  });
  if (!existing && !report.supported) {
    request.log.warn(
      { tool, integrationVersion: report.version, clientVersion: report.clientVersion, editorName: report.editorName },
      'Unsupported integration version detected',
    );
  }
  await sendUnsupportedVersionAlert(report, request, adminNotifier);
  return reply.code(existing ? 200 : 201).send({ report, isNew: !existing });
}

async function sendUnsupportedVersionAlert(
  report: {
    id: string;
    tool: string;
    version: string;
    supported: boolean;
    clientVersion: string;
    editorName: string;
    reportCount: number;
    acknowledgedAt: Date | null;
    alertAttemptedAt: Date | null;
    alertSentAt: Date | null;
  },
  request: FastifyRequest,
  adminNotifier: AdminNotifier,
) {
  if (
    report.supported ||
    report.acknowledgedAt ||
    report.alertSentAt ||
    !adminNotifier.isConfigured()
  ) {
    return;
  }

  const retryBefore = new Date(Date.now() - ALERT_RETRY_DELAY_MS);
  const claimed = await prisma.integrationVersionReport.updateMany({
    where: {
      id: report.id,
      supported: false,
      acknowledgedAt: null,
      alertSentAt: null,
      OR: [{ alertAttemptedAt: null }, { alertAttemptedAt: { lt: retryBefore } }],
    },
    data: { alertAttemptedAt: new Date(), alertError: null },
  });
  if (claimed.count !== 1) return;

  try {
    const policy = classifyUnsupportedIntegrationVersion(
      report.tool === 'claude' ? 'claude' : 'codex',
      report.version,
    );
    await adminNotifier.notifyUnsupportedIntegration({
      tool: report.tool === 'claude' ? 'claude' : 'codex',
      version: report.version,
      clientVersion: report.clientVersion,
      editorName: report.editorName,
      reportCount: report.reportCount,
      attention: policy.attention,
      latestExactVersion: policy.latestExactVersion,
    });
    await prisma.integrationVersionReport.update({
      where: { id: report.id },
      data: { alertSentAt: new Date(), alertError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Неизвестная ошибка.';
    await prisma.integrationVersionReport.update({
      where: { id: report.id },
      data: { alertError: message },
    });
    request.log.error(
      { tool: report.tool, integrationVersion: report.version, error: message },
      'Failed to send unsupported integration version alert',
    );
  }
}

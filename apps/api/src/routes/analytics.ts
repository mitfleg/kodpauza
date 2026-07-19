import type { FastifyInstance } from 'fastify';
import { billableCpmKopecks, surfaceSchema, surfaces } from '@kodpauza/shared';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';
import { campaignForecast } from '../services/campaignForecast.js';
import { aggregateFleet, classifyFleetInstall } from '../services/fleetHealth.js';

export const forecastQuerySchema = z.object({
  budgetKopecks: z.coerce.number().int().positive().max(2_000_000_000),
  cpmKopecks: z.coerce.number().int().min(2_000).max(1_300_000_000),
  format: z.enum(['standard', 'premium']),
  impressionsLimit: z.coerce.number().int().positive().max(10_000_000).optional(),
  surfaces: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim()
        ? value.split(',').map((surface) => surface.trim())
        : [...surfaces],
    z.array(surfaceSchema).min(1).max(surfaces.length),
  ),
});

export function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get('/v1/admin/extension-fleet', { preHandler: requireRole('admin') }, async () => {
    const now = new Date();
    const installs = await prisma.extensionInstall.findMany({
      orderBy: { lastSeenAt: 'desc' },
      select: {
        extensionVersion: true,
        vscodeVersion: true,
        os: true,
        integrationsEnabled: true,
        codexDetected: true,
        claudeDetected: true,
        heartbeatSchemaVersion: true,
        editorName: true,
        codexVersion: true,
        claudeVersion: true,
        codexPatchStatus: true,
        claudePatchStatus: true,
        codexPatchErrorCategory: true,
        claudePatchErrorCategory: true,
        lastSeenAt: true,
      },
    });
    const summary = aggregateFleet(installs, now);
    const missingHeartbeat = {
      overOneHour: installs.filter(
        (install) => now.getTime() - install.lastSeenAt.getTime() > 60 * 60 * 1_000,
      ).length,
      overOneDay: installs.filter(
        (install) => now.getTime() - install.lastSeenAt.getTime() > 24 * 60 * 60 * 1_000,
      ).length,
      overSevenDays: installs.filter(
        (install) => now.getTime() - install.lastSeenAt.getTime() > 7 * 24 * 60 * 60 * 1_000,
      ).length,
    };
    return {
      generatedAt: now,
      ...summary,
      missingHeartbeat,
      patchStatuses: countPatchStatuses(installs),
      installs: installs.slice(0, 20).map((install) => ({
        health: classifyFleetInstall(install, now),
        extensionVersion: install.extensionVersion,
        editor: install.editorName ?? (install.vscodeVersion ? 'VS Code compatible' : null),
        editorVersion: install.vscodeVersion,
        tools: [install.codexDetected ? 'codex' : null, install.claudeDetected ? 'claude' : null].filter(
          (tool): tool is string => Boolean(tool),
        ),
        codex: install.codexDetected
          ? {
              version: install.codexVersion,
              patchStatus: install.codexPatchStatus,
              errorCategory: install.codexPatchErrorCategory,
            }
          : null,
        claude: install.claudeDetected
          ? {
              version: install.claudeVersion,
              patchStatus: install.claudePatchStatus,
              errorCategory: install.claudePatchErrorCategory,
            }
          : null,
        lastSeenAt: install.lastSeenAt,
      })),
      limitations: {
        patchStatusAvailable: installs.some(
          (install) =>
            Boolean(
              (install.codexDetected && install.codexPatchStatus) ||
                (install.claudeDetected && install.claudePatchStatus),
            ),
        ),
        patchErrorAvailable: installs.some((install) =>
          Boolean(
            (install.codexDetected && install.codexPatchErrorCategory) ||
              (install.claudeDetected && install.claudePatchErrorCategory),
          ),
        ),
        note: 'Старые клиенты продолжают работать, но расширенные поля у них отображаются как «нет данных».',
      },
    };
  });

  app.get('/v1/advertiser/forecast', { preHandler: requireRole('advertiser') }, async (request, reply) => {
    const parsed = forecastQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверные параметры прогноза.' });
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
    const [recentImpressions, activeCampaigns] = await Promise.all([
      prisma.adEvent.count({
        where: {
          type: 'impression',
          fraudStatus: 'clean',
          surface: { in: parsed.data.surfaces },
          createdAt: { gte: since },
        },
      }),
      prisma.campaign.count({
        where: {
          status: 'active',
          surfaces: { some: { surface: { in: parsed.data.surfaces } } },
        },
      }),
    ]);
    const billable = billableCpmKopecks(parsed.data.cpmKopecks, parsed.data.format);
    return {
      ...campaignForecast({
        budgetKopecks: parsed.data.budgetKopecks,
        billableCpmKopecks: billable,
        impressionsLimit: parsed.data.impressionsLimit,
        recentImpressions,
        sampleDays: 7,
        activeCampaigns,
      }),
      billableCpmKopecks: billable,
      basis: {
        sampleDays: 7,
        recentImpressions,
        surfaces: parsed.data.surfaces,
        label: 'Оценка по фактическим чистым показам выбранных поверхностей за последние 7 дней.',
      },
      disclaimer: 'Это прогноз, а не гарантия результата или срока открутки.',
    };
  });

  app.get('/v1/advertiser/stats.csv', { preHandler: requireRole('advertiser') }, async (request, reply) => {
    const advertiser = await prisma.advertiserProfile.findUnique({ where: { userId: request.authUser!.id } });
    const campaigns = advertiser
      ? await prisma.campaign.findMany({
          where: { advertiserId: advertiser.id },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const rows = [
      ['Кампания', 'Статус', 'Формат', 'Показы', 'Переходы', 'CTR, %', 'Расход, ₽', 'Бюджет, ₽', 'CPM, ₽', 'Создана'],
      ...campaigns.map((campaign) => [
        campaign.name,
        campaign.status,
        campaign.format,
        campaign.impressionsServed,
        campaign.clicks,
        campaign.impressionsServed
          ? ((campaign.clicks / campaign.impressionsServed) * 100).toFixed(2)
          : '0.00',
        (campaign.spentKopecks / 100).toFixed(2),
        (campaign.budgetKopecks / 100).toFixed(2),
        (campaign.billableCpmKopecks / 100).toFixed(2),
        campaign.createdAt.toISOString(),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="kodpauza-campaigns.csv"')
      .send(`\uFEFF${csv}`);
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function countPatchStatuses(
  installs: Array<{
    codexDetected: boolean;
    claudeDetected: boolean;
    codexPatchStatus: string | null;
    claudePatchStatus: string | null;
  }>,
) {
  const result: Record<string, number> = {};
  for (const install of installs) {
    for (const status of [
      install.codexDetected ? install.codexPatchStatus : null,
      install.claudeDetected ? install.claudePatchStatus : null,
    ]) {
      if (status) result[status] = (result[status] ?? 0) + 1;
    }
  }
  return result;
}

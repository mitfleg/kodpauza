import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  adPolicy,
  billableCpmKopecks,
  surfaceSchema,
  surfaces,
  type Surface,
} from '@kodpauza/shared';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';
import { campaignForecast } from '../services/campaignForecast.js';
import { aggregateFleet, classifyFleetInstall } from '../services/fleetHealth.js';

const forecastSurfaceCpmSchema = z.object({
  surface: surfaceSchema,
  cpmKopecks: z.number().int().min(2_000).max(1_300_000_000),
});

export const forecastQuerySchema = z
  .object({
    budgetKopecks: z.coerce.number().int().positive().max(2_000_000_000),
    cpmKopecks: z.coerce.number().int().min(2_000).max(1_300_000_000),
    format: z.enum(['standard', 'premium']),
    impressionsLimit: z.coerce.number().int().positive().max(10_000_000).optional(),
    dailyBudgetKopecks: z.coerce.number().int().positive().max(2_000_000_000).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    surfaces: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim()
          ? value.split(',').map((surface) => surface.trim())
          : [...surfaces],
      z.array(surfaceSchema).min(1).max(surfaces.length),
    ),
    surfaceCpms: z.preprocess((value) => {
      if (typeof value !== 'string' || !value.trim()) return undefined;
      return value.split(',').map((entry) => {
        const [surface, cpm] = entry.split(':');
        return { surface: surface?.trim(), cpmKopecks: Number(cpm) };
      });
    }, z.array(forecastSurfaceCpmSchema).min(1).max(surfaces.length).optional()),
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'Дата завершения должна быть позже даты начала.',
      });
    }
    if (!value.surfaceCpms) return;
    const unique = new Set(value.surfaceCpms.map((placement) => placement.surface));
    if (unique.size !== value.surfaceCpms.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['surfaceCpms'],
        message: 'CPM каждой поверхности можно передать только один раз.',
      });
    }
    if (
      unique.size !== value.surfaces.length ||
      value.surfaces.some((surface) => !unique.has(surface))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['surfaceCpms'],
        message: 'CPM должен быть указан для каждой выбранной поверхности.',
      });
    }
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
    const now = new Date();
    const historyUntil = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ));
    const historyDays = 28;
    const historySince = new Date(historyUntil.getTime() - historyDays * 24 * 60 * 60 * 1_000);
    const selectedSurfaces = parsed.data.surfaces;
    const surfaceList = Prisma.join(
      selectedSurfaces.map((surface) => Prisma.sql`${surface}::"Surface"`),
    );
    const [dailyRows, marketRows] = await Promise.all([
      prisma.$queryRaw<Array<{ surface: Surface; day: Date; impressions: bigint }>>(Prisma.sql`
        SELECT
          "surface",
          date_trunc('day', "createdAt") AS "day",
          COUNT(*)::bigint AS "impressions"
        FROM "AdEvent"
        WHERE "type" = 'impression'::"AdEventType"
          AND "fraudStatus" = 'clean'::"FraudStatus"
          AND "surface" IN (${surfaceList})
          AND "createdAt" >= ${historySince}
          AND "createdAt" < ${historyUntil}
        GROUP BY "surface", date_trunc('day', "createdAt")
        ORDER BY "surface", "day"
      `),
      prisma.campaignSurface.findMany({
        where: {
          enabled: true,
          surface: { in: selectedSurfaces },
          campaign: {
            is: {
              status: 'active',
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ],
            },
          },
        },
        select: {
          campaignId: true,
          surface: true,
          billableCpmKopecks: true,
          campaign: {
            select: {
              budgetKopecks: true,
              spentKopecks: true,
              advertiser: { select: { balanceKopecks: true } },
            },
          },
        },
      }),
    ]);
    const histories = dailyImpressionHistory(
      selectedSurfaces,
      dailyRows,
      historySince,
      historyDays,
    );
    const competitiveRows = marketRows.filter(
      (row) =>
        row.campaign.spentKopecks < row.campaign.budgetKopecks &&
        row.campaign.advertiser.balanceKopecks > 0,
    );
    const selectedPlacements =
      parsed.data.surfaceCpms ??
      selectedSurfaces.map((surface) => ({
        surface,
        cpmKopecks: parsed.data.cpmKopecks,
      }));
    const forecast = campaignForecast({
      budgetKopecks: parsed.data.budgetKopecks,
      impressionsLimit: parsed.data.impressionsLimit,
      dailyBudgetKopecks: parsed.data.dailyBudgetKopecks,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      now,
      premiumMarkupBps: parsed.data.format === 'premium' ? adPolicy.premiumMarkupBps : 0,
      placements: selectedPlacements.map((placement) => ({
        surface: placement.surface,
        cpmKopecks: placement.cpmKopecks,
        billableCpmKopecks: billableCpmKopecks(
          placement.cpmKopecks,
          parsed.data.format,
        ),
        competitorBillableCpms: competitiveRows
          .filter((row) => row.surface === placement.surface)
          .map((row) => row.billableCpmKopecks),
        dailyNetworkImpressions: histories.get(placement.surface) ?? [],
      })),
    });
    const recentImpressions = dailyRows.reduce(
      (total, row) => total + Number(row.impressions),
      0,
    );
    return {
      ...forecast,
      billableCpmKopecks: forecast.blendedBillableCpmKopecks,
      basis: {
        sampleDays: historyDays,
        recentImpressions,
        surfaces: selectedSurfaces,
        label: 'Оценка по чистым показам за 28 полных дней и текущим CPM активных кампаний.',
      },
      disclaimer: 'Вероятность и срок являются прогнозом, а не гарантией открутки.',
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

function dailyImpressionHistory(
  selectedSurfaces: Surface[],
  rows: Array<{ surface: Surface; day: Date; impressions: bigint }>,
  since: Date,
  days: number,
): Map<Surface, number[]> {
  const histories = new Map(
    selectedSurfaces.map((surface) => [surface, Array.from({ length: days }, () => 0)]),
  );
  for (const row of rows) {
    const dayIndex = Math.floor((row.day.getTime() - since.getTime()) / (24 * 60 * 60 * 1_000));
    const history = histories.get(row.surface);
    if (!history || dayIndex < 0 || dayIndex >= days) continue;
    history[dayIndex] = Number(row.impressions);
  }
  return histories;
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

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { impressionCostKopecks } from '@kodpauza/shared';
import {
  classifyUnsupportedIntegrationVersion,
  compareIntegrationVersionReports,
} from '../services/integrationVersionPolicy.js';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';
import { lockCampaignMutation, sameCampaignRevision } from '../services/campaignMutation.js';
import { campaignComplianceIssues } from '../services/campaignCompliance.js';
import {
  prepareMonthlyOrdReports,
  refreshOrdReport,
  submitOrdReport,
} from '../services/ordReporting.js';
import type { YandexOrdClientContract } from '../services/yandexOrd.js';

const reviewedCampaignSchema = z
  .object({
    reviewedUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
  })
  .strict();

const rejectedCampaignSchema = reviewedCampaignSchema.extend({
  reason: z.string().trim().min(3).max(500),
});

const ordMonthSchema = z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/) }).strict();
const adminPaginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(5).max(50).default(10),
  })
  .strict();
const ordCampaignBindingSchema = z
  .object({
    organizationId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,128}$/),
    platformId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,128}$/),
    creatives: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(128),
            ordCreativeId: z
              .string()
              .trim()
              .regex(/^[A-Za-z0-9_-]{1,128}$/),
            erid: z.string().trim().min(5).max(80),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();

export function registerAdminRoutes(app: FastifyInstance, ordClient: YandexOrdClientContract) {
  app.get('/v1/admin/funnel', { preHandler: requireRole('admin') }, async () => {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [developers, installs, serves, impressions, registrations, recentInstalls, recentEvents] =
      await Promise.all([
        prisma.user.findMany({
          where: { role: 'developer' },
          select: { id: true, emailVerifiedAt: true },
        }),
        prisma.extensionInstall.findMany({
          select: { userId: true, integrationsEnabled: true, createdAt: true },
        }),
        prisma.adServe.findMany({ select: { userId: true } }),
        prisma.adEvent.findMany({
          where: { type: 'impression' },
          select: { userId: true, rewardKopecks: true },
        }),
        prisma.user.findMany({
          where: { role: 'developer', createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        prisma.extensionInstall.findMany({
          where: { createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        prisma.adEvent.findMany({
          where: { type: 'impression', createdAt: { gte: since } },
          select: { createdAt: true },
        }),
      ]);

    const unique = <T>(items: T[]) => new Set(items).size;
    const stages = [
      { id: 'registered', label: 'Регистрация разработчика', value: developers.length },
      {
        id: 'verified',
        label: 'Подтверждение почты',
        value: developers.filter((user) => user.emailVerifiedAt).length,
      },
      {
        id: 'extension_authenticated',
        label: 'Вход из расширения',
        value: unique(installs.map((install) => install.userId)),
      },
      {
        id: 'integration_enabled',
        label: 'Подключение Codex или Claude',
        value: unique(
          installs
            .filter((install) => install.integrationsEnabled)
            .map((install) => install.userId),
        ),
      },
      {
        id: 'ad_received',
        label: 'Первая рекламная выдача',
        value: unique(serves.map((serve) => serve.userId)),
      },
      {
        id: 'impression_recorded',
        label: 'Подтверждённый показ',
        value: unique(impressions.map((event) => event.userId)),
      },
      {
        id: 'earning_received',
        label: 'Первое начисление',
        value: unique(
          impressions.filter((event) => event.rewardKopecks > 0).map((event) => event.userId),
        ),
      },
    ];

    const dayKey = (value: Date) => value.toISOString().slice(0, 10);
    const countByDay = (values: Date[]) => {
      const result = new Map<string, number>();
      for (const value of values) result.set(dayKey(value), (result.get(dayKey(value)) ?? 0) + 1);
      return result;
    };
    const registeredByDay = countByDay(registrations.map((item) => item.createdAt));
    const installsByDay = countByDay(recentInstalls.map((item) => item.createdAt));
    const impressionsByDay = countByDay(recentEvents.map((item) => item.createdAt));
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (13 - index));
      const key = dayKey(date);
      return {
        date: key,
        registrations: registeredByDay.get(key) ?? 0,
        installs: installsByDay.get(key) ?? 0,
        impressions: impressionsByDay.get(key) ?? 0,
      };
    });
    return { stages, days };
  });
  app.get('/v1/admin/users', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = adminPaginationSchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Некорректная страница пользователей.' });
    const { page, pageSize } = parsed.data;
    const [users, total, developers, advertisers] = await prisma.$transaction([
      prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          role: true,
          displayName: true,
          createdAt: true,
          developerProfile: { select: { balanceKopecks: true } },
          advertiserProfile: { select: { companyName: true, balanceKopecks: true } },
        },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { developerProfile: { isNot: null } } }),
      prisma.user.count({ where: { advertiserProfile: { isNot: null } } }),
    ]);
    return {
      users,
      pagination: adminPagination(total, page, pageSize),
      summary: { total, developers, advertisers },
    };
  });

  app.get('/v1/admin/campaigns', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = adminPaginationSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница кампаний.' });
    const { page, pageSize } = parsed.data;
    const [campaigns, total, pending, paused, rejected, activeCandidates] =
      await prisma.$transaction([
        prisma.campaign.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            advertiser: { include: { user: { select: { email: true } } } },
            surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
            creatives: { where: { enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          },
        }),
        prisma.campaign.count(),
        prisma.campaign.count({ where: { status: 'pending' } }),
        prisma.campaign.count({ where: { status: 'paused' } }),
        prisma.campaign.count({ where: { status: 'rejected' } }),
        prisma.campaign.findMany({
          where: { status: 'active' },
          select: { startsAt: true, endsAt: true, budgetKopecks: true, spentKopecks: true },
        }),
      ]);
    const now = Date.now();
    const delivering = activeCandidates.filter(
      (campaign) =>
        campaign.spentKopecks < campaign.budgetKopecks &&
        (!campaign.startsAt || campaign.startsAt.getTime() <= now) &&
        (!campaign.endsAt || campaign.endsAt.getTime() > now),
    ).length;
    return {
      campaigns,
      pagination: adminPagination(total, page, pageSize),
      summary: { total, delivering, statuses: { pending, paused, rejected } },
    };
  });

  app.patch(
    '/v1/admin/campaigns/:id/ord',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = ordCampaignBindingSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Неверная привязка ОРД.' });
      const result = await prisma.$transaction(async (tx) => {
        await lockCampaignMutation(tx, id);
        const campaign = await tx.campaign.findUnique({
          where: { id },
          include: { creatives: { where: { enabled: true }, orderBy: { createdAt: 'asc' } } },
        });
        if (!campaign) return { kind: 'not_found' as const };
        const activeIds = new Set(campaign.creatives.map((creative) => creative.id));
        if (
          parsed.data.creatives.length !== activeIds.size ||
          parsed.data.creatives.some((creative) => !activeIds.has(creative.id))
        ) {
          return { kind: 'creative_mismatch' as const };
        }
        await tx.advertiserProfile.update({
          where: { id: campaign.advertiserId },
          data: { ordOrganizationId: parsed.data.organizationId },
        });
        await tx.campaign.update({
          where: { id },
          data: {
            selfPromotion: true,
            ordPlatformId: parsed.data.platformId,
            erid: parsed.data.creatives[0]!.erid,
          },
        });
        for (const creative of parsed.data.creatives) {
          await tx.campaignCreative.update({
            where: { id: creative.id },
            data: {
              erid: creative.erid,
              ordCreativeId: creative.ordCreativeId,
              ordStatus: 'registered',
              ordRegisteredAt: new Date(),
              ordLastError: null,
            },
          });
        }
        await writeAuditLog(tx, request.authUser!.id, 'campaign.ord.bind', 'campaign', id, {
          organizationId: parsed.data.organizationId,
          platformId: parsed.data.platformId,
          creativeIds: parsed.data.creatives.map((creative) => creative.id),
        });
        return {
          kind: 'bound' as const,
          campaign: await tx.campaign.findUniqueOrThrow({
            where: { id },
            include: { advertiser: true, creatives: { where: { enabled: true } } },
          }),
        };
      });
      if (result.kind === 'not_found') {
        return reply.code(404).send({ error: 'Кампания не найдена.' });
      }
      if (result.kind === 'creative_mismatch') {
        return reply
          .code(409)
          .send({ error: 'Передайте привязки для всех текущих активных креативов.' });
      }
      return { campaign: result.campaign };
    },
  );

  app.get('/v1/admin/ord/reports', { preHandler: requireRole('admin') }, async () => ({
    configured: ordClient.isConfigured(),
    reports: await prisma.ordStatisticReport.findMany({
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        creative: {
          select: {
            label: true,
            ordCreativeId: true,
            campaign: { select: { id: true, name: true } },
          },
        },
      },
    }),
  }));

  app.post(
    '/v1/admin/ord/reports/prepare',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const parsed = ordMonthSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'Укажите месяц в формате YYYY-MM.' });
      return { reports: await prepareMonthlyOrdReports(parsed.data.month) };
    },
  );

  app.post(
    '/v1/admin/ord/reports/:id/submit',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        return { report: await submitOrdReport(id, ordClient) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось отправить отчёт ОРД.';
        return reply.code(message.includes('не найден') ? 404 : 503).send({ error: message });
      }
    },
  );

  app.post(
    '/v1/admin/ord/reports/:id/refresh',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        return { report: await refreshOrdReport(id, ordClient) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось проверить отчёт ОРД.';
        return reply.code(message.includes('не найден') ? 404 : 503).send({ error: message });
      }
    },
  );

  app.get('/v1/admin/events', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = adminPaginationSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница событий.' });
    const { page, pageSize } = parsed.data;
    const [events, total] = await prisma.$transaction([
      prisma.adEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          eventId: true,
          adId: true,
          type: true,
          createdAt: true,
          rewardKopecks: true,
          fraudStatus: true,
          user: { select: { email: true } },
          campaign: { select: { name: true } },
        },
      }),
      prisma.adEvent.count(),
    ]);
    return { events, pagination: adminPagination(total, page, pageSize) };
  });

  app.get('/v1/admin/fraud-flags', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = adminPaginationSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница сигналов.' });
    const { page, pageSize } = parsed.data;
    const [fraudFlags, total] = await prisma.$transaction([
      prisma.fraudFlag.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          reason: true,
          severity: true,
          createdAt: true,
          user: { select: { email: true } },
          event: { select: { eventId: true, adId: true, type: true, fraudStatus: true } },
        },
      }),
      prisma.fraudFlag.count(),
    ]);
    return {
      fraudFlags,
      pagination: adminPagination(total, page, pageSize),
      summary: { total },
    };
  });

  app.get('/v1/admin/audit-log', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = adminPaginationSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница журнала.' });
    const { page, pageSize } = parsed.data;
    const [auditLog, total] = await prisma.$transaction([
      prisma.adminAuditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { admin: { select: { email: true } } },
      }),
      prisma.adminAuditLog.count(),
    ]);
    return { auditLog, pagination: adminPagination(total, page, pageSize) };
  });

  app.get(
    '/v1/admin/privacy-requests',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const parsed = adminPaginationSchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({ error: 'Некорректная страница обращений.' });
      const { page, pageSize } = parsed.data;
      const [requests, total] = await prisma.$transaction([
        prisma.privacyRequest.findMany({
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { user: { select: { email: true, role: true, displayName: true } } },
        }),
        prisma.privacyRequest.count(),
      ]);
      return { requests, pagination: adminPagination(total, page, pageSize) };
    },
  );

  app.post(
    '/v1/admin/privacy-requests/:id/status',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          status: z.enum(['processing', 'completed', 'rejected']),
          resolution: z.string().trim().min(3).max(2_000),
        })
        .strict()
        .safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Укажите статус и результат.' });
      const existing = await prisma.privacyRequest.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'Заявка не найдена.' });

      const privacyRequest = await prisma.$transaction(async (tx) => {
        const updated = await tx.privacyRequest.update({
          where: { id },
          data: {
            status: body.data.status,
            resolution: body.data.resolution,
            reviewedAt: new Date(),
            completedAt: body.data.status === 'completed' ? new Date() : null,
          },
        });
        await writeAuditLog(
          tx,
          request.authUser!.id,
          'privacy.request.status',
          'privacy-request',
          id,
          {
            previousStatus: existing.status,
            nextStatus: updated.status,
            type: existing.type,
          },
        );
        return updated;
      });
      return { request: privacyRequest };
    },
  );

  app.get(
    '/v1/admin/integration-versions',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const parsed = adminPaginationSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница версий.' });
      const { page, pageSize } = parsed.data;
      const rawReports = await prisma.integrationVersionReport.findMany();
      const classifiedReports = rawReports
        .map((report) => ({
          ...report,
          ...classifyUnsupportedIntegrationVersion(
            report.tool === 'claude' ? 'claude' : 'codex',
            report.version,
          ),
        }))
        .sort(compareIntegrationVersionReports);
      const reports = classifiedReports.slice((page - 1) * pageSize, page * pageSize);
      const pending = classifiedReports.filter(
        (report) => !report.supported && !report.acknowledgedAt,
      ).length;
      return {
        reports,
        pagination: adminPagination(classifiedReports.length, page, pageSize),
        summary: { pending },
      };
    },
  );

  app.post(
    '/v1/admin/integration-versions/:id/acknowledge',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.integrationVersionReport.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'Отчет о версии не найден.' });
      if (existing.acknowledgedAt) return { report: existing };

      const report = await prisma.$transaction(async (tx) => {
        const updated = await tx.integrationVersionReport.update({
          where: { id },
          data: { acknowledgedAt: new Date() },
        });
        await writeAuditLog(
          tx,
          request.authUser!.id,
          'integration.version.acknowledge',
          'integration-version',
          id,
          {
            tool: existing.tool,
            version: existing.version,
            supported: existing.supported,
          },
        );
        return updated;
      });
      return { report };
    },
  );

  app.get('/v1/admin/finance', { preHandler: requireRole('admin') }, async () => {
    const [charges, rewards, credits] = await Promise.all([
      prisma.ledgerEntry.aggregate({
        where: { type: 'advertiser_charge' },
        _sum: { amountKopecks: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { type: 'impression_reward' },
        _sum: { amountKopecks: true },
      }),
      prisma.ledgerEntry.aggregate({
        where: { type: 'advertiser_credit' },
        _sum: { amountKopecks: true },
      }),
    ]);
    const chargedKopecks = Math.abs(charges._sum.amountKopecks ?? 0);
    const rewardedKopecks = rewards._sum.amountKopecks ?? 0;
    return {
      chargedKopecks,
      rewardedKopecks,
      platformMarginKopecks: chargedKopecks - rewardedKopecks,
      creditedKopecks: credits._sum.amountKopecks ?? 0,
    };
  });

  app.get('/v1/admin/payments', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = adminPaginationSchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Некорректная страница пополнений.' });
    const { page, pageSize } = parsed.data;
    const [payments, total] = await prisma.$transaction([
      prisma.advertiserPayment.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          providerPaymentId: true,
          amountKopecks: true,
          currency: true,
          status: true,
          providerTest: true,
          failureCode: true,
          paidAt: true,
          createdAt: true,
          advertiser: {
            select: {
              companyName: true,
              user: { select: { email: true } },
            },
          },
        },
      }),
      prisma.advertiserPayment.count(),
    ]);
    return { payments, pagination: adminPagination(total, page, pageSize) };
  });

  app.post(
    '/v1/admin/campaigns/:id/approve',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = reviewedCampaignSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Обновите список кампаний перед модерацией.' });
      }
      const result = await prisma.$transaction(async (tx) => {
        await lockCampaignMutation(tx, id);
        const existing = await tx.campaign.findUnique({
          where: { id },
          include: {
            advertiser: true,
            creatives: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
          },
        });
        if (!existing) return { kind: 'not_found' as const };
        if (existing.status === 'active') return { kind: 'approved' as const, campaign: existing };
        if (!sameCampaignRevision(existing.updatedAt, body.data.reviewedUpdatedAt)) {
          return { kind: 'conflict' as const };
        }
        if (existing.status !== 'pending') return { kind: 'invalid_status' as const };
        const advertiser = existing.advertiser;
        if (
          !advertiser ||
          advertiser.balanceKopecks < impressionCostKopecks(existing.billableCpmKopecks)
        ) {
          return { kind: 'insufficient_balance' as const };
        }
        const complianceIssues = campaignComplianceIssues(advertiser, existing.creatives);
        if (complianceIssues.length > 0) {
          return { kind: 'compliance' as const, issues: complianceIssues };
        }
        const updated = await tx.campaign.update({ where: { id }, data: { status: 'active' } });
        await writeAuditLog(tx, request.authUser!.id, 'campaign.approve', 'campaign', id, {
          previousStatus: existing.status,
          nextStatus: updated.status,
          reviewedUpdatedAt: body.data.reviewedUpdatedAt.toISOString(),
        });
        return { kind: 'approved' as const, campaign: updated };
      });
      if (result.kind === 'not_found') {
        return reply.code(404).send({ error: 'Кампания не найдена.' });
      }
      if (result.kind === 'conflict') {
        return reply
          .code(409)
          .send({ error: 'Кампания изменилась. Обновите данные перед модерацией.' });
      }
      if (result.kind === 'invalid_status') {
        return reply.code(409).send({ error: 'Одобрить можно только кампанию на модерации.' });
      }
      if (result.kind === 'insufficient_balance') {
        return reply
          .code(409)
          .send({ error: 'У рекламодателя недостаточно средств для первого показа.' });
      }
      if (result.kind === 'compliance') {
        return reply.code(409).send({
          error: 'Кампания не готова к активации.',
          code: 'CAMPAIGN_COMPLIANCE_REQUIRED',
          issues: result.issues,
        });
      }
      return { campaign: result.campaign };
    },
  );

  app.post(
    '/v1/admin/campaigns/:id/pause',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'Кампания не найдена.' });
      if (existing.status === 'paused') return { campaign: existing };

      if (existing.status !== 'active') {
        return reply.code(409).send({ error: 'Остановить можно только активную кампанию.' });
      }

      const campaign = await prisma.$transaction(async (tx) => {
        const updated = await tx.campaign.update({ where: { id }, data: { status: 'paused' } });
        await writeAuditLog(tx, request.authUser!.id, 'campaign.pause', 'campaign', id, {
          previousStatus: existing.status,
          nextStatus: updated.status,
        });
        return updated;
      });
      return { campaign };
    },
  );

  app.post(
    '/v1/admin/campaigns/:id/reject',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = rejectedCampaignSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Укажите причину отклонения.' });
      const result = await prisma.$transaction(async (tx) => {
        await lockCampaignMutation(tx, id);
        const existing = await tx.campaign.findUnique({ where: { id } });
        if (!existing) return { kind: 'not_found' as const };
        if (!sameCampaignRevision(existing.updatedAt, body.data.reviewedUpdatedAt)) {
          return { kind: 'conflict' as const };
        }
        if (!['pending', 'active'].includes(existing.status)) {
          return { kind: 'invalid_status' as const };
        }
        const updated = await tx.campaign.update({ where: { id }, data: { status: 'rejected' } });
        await writeAuditLog(tx, request.authUser!.id, 'campaign.reject', 'campaign', id, {
          previousStatus: existing.status,
          nextStatus: updated.status,
          reason: body.data.reason,
          reviewedUpdatedAt: body.data.reviewedUpdatedAt.toISOString(),
        });
        return { kind: 'rejected' as const, campaign: updated };
      });
      if (result.kind === 'not_found') {
        return reply.code(404).send({ error: 'Кампания не найдена.' });
      }
      if (result.kind === 'conflict') {
        return reply
          .code(409)
          .send({ error: 'Кампания изменилась. Обновите данные перед модерацией.' });
      }
      if (result.kind === 'invalid_status') {
        return reply.code(409).send({ error: 'Эту кампанию нельзя отклонить в текущем статусе.' });
      }
      return { campaign: result.campaign };
    },
  );
}

async function writeAuditLog(
  tx: Prisma.TransactionClient,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await tx.adminAuditLog.create({
    data: { adminId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonObject },
  });
}

function adminPagination(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

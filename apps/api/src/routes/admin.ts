import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { impressionCostKopecks } from '@kodpauza/shared';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';

export function registerAdminRoutes(app: FastifyInstance) {
  app.get('/v1/admin/users', { preHandler: requireRole('admin') }, async () => ({
    users: await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
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
  }));

  app.get('/v1/admin/campaigns', { preHandler: requireRole('admin') }, async () => ({
    campaigns: await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { advertiser: { include: { user: { select: { email: true } } } } },
    }),
  }));

  app.get('/v1/admin/events', { preHandler: requireRole('admin') }, async () => ({
    events: await prisma.adEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
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
  }));

  app.get('/v1/admin/fraud-flags', { preHandler: requireRole('admin') }, async () => ({
    fraudFlags: await prisma.fraudFlag.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        reason: true,
        severity: true,
        createdAt: true,
        user: { select: { email: true } },
        event: { select: { eventId: true, adId: true, type: true, fraudStatus: true } },
      },
    }),
  }));

  app.get('/v1/admin/audit-log', { preHandler: requireRole('admin') }, async () => ({
    auditLog: await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { admin: { select: { email: true } } },
    }),
  }));

  app.get('/v1/admin/integration-versions', { preHandler: requireRole('admin') }, async () => ({
    reports: await prisma.integrationVersionReport.findMany({
      orderBy: [{ acknowledgedAt: 'asc' }, { lastSeenAt: 'desc' }],
      take: 100,
    }),
  }));

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

  app.get('/v1/admin/payments', { preHandler: requireRole('admin') }, async () => ({
    payments: await prisma.advertiserPayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
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
  }));

  app.post(
    '/v1/admin/campaigns/:id/approve',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'Кампания не найдена.' });
      if (existing.status === 'active') return { campaign: existing };
      if (existing.status !== 'pending') {
        return reply.code(409).send({ error: 'Одобрить можно только кампанию на модерации.' });
      }

      const advertiser = await prisma.advertiserProfile.findUnique({
        where: { id: existing.advertiserId },
      });
      if (
        !advertiser ||
        advertiser.balanceKopecks < impressionCostKopecks(existing.billableCpmKopecks)
      ) {
        return reply
          .code(409)
          .send({ error: 'У рекламодателя недостаточно средств для первого показа.' });
      }

      const campaign = await prisma.$transaction(async (tx) => {
        const updated = await tx.campaign.update({ where: { id }, data: { status: 'active' } });
        await writeAuditLog(tx, request.authUser!.id, 'campaign.approve', 'campaign', id, {
          previousStatus: existing.status,
          nextStatus: updated.status,
        });
        return updated;
      });
      return { campaign };
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
      const body = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Укажите причину отклонения.' });
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (!existing) return reply.code(404).send({ error: 'Кампания не найдена.' });
      if (!['pending', 'active'].includes(existing.status)) {
        return reply.code(409).send({ error: 'Эту кампанию нельзя отклонить в текущем статусе.' });
      }

      const campaign = await prisma.$transaction(async (tx) => {
        const updated = await tx.campaign.update({ where: { id }, data: { status: 'rejected' } });
        await writeAuditLog(tx, request.authUser!.id, 'campaign.reject', 'campaign', id, {
          previousStatus: existing.status,
          nextStatus: updated.status,
          reason: body.data.reason,
        });
        return updated;
      });
      return { campaign };
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

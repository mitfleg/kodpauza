import type { FastifyInstance } from 'fastify';
import {
  billableCpmKopecks,
  createCampaignSchema,
  impressionCostKopecks,
  surfaces as supportedSurfaces,
  updateAdvertiserProfileSchema,
  updateCampaignSchema,
} from '@kodpauza/shared';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';
import { lockCampaignMutation, sameCampaignRevision } from '../services/campaignMutation.js';

async function advertiserProfile(userId: string) {
  return prisma.advertiserProfile.findUnique({ where: { userId } });
}

export function registerAdvertiserRoutes(app: FastifyInstance) {
  app.get(
    '/v1/advertiser/profile',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      const advertiser = await advertiserProfile(request.authUser!.id);
      if (!advertiser) return reply.code(404).send({ error: 'Профиль рекламодателя не найден.' });
      return {
        profile: {
          companyName: advertiser.companyName,
          publicName: advertiser.publicName,
          advertiserInfoUrl: advertiser.advertiserInfoUrl,
          inn: advertiser.inn,
          ordOrganizationId: advertiser.ordOrganizationId,
        },
      };
    },
  );

  app.patch(
    '/v1/advertiser/profile',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      const parsed = updateAdvertiserProfileSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Неверные данные рекламодателя.' });
      }
      const existing = await advertiserProfile(request.authUser!.id);
      if (!existing) return reply.code(404).send({ error: 'Профиль рекламодателя не найден.' });
      const profile = await prisma.advertiserProfile.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      return {
        profile: {
          companyName: profile.companyName,
          publicName: profile.publicName,
          advertiserInfoUrl: profile.advertiserInfoUrl,
          inn: profile.inn,
          ordOrganizationId: profile.ordOrganizationId,
        },
      };
    },
  );

  app.post(
    '/v1/advertiser/campaigns',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      const parsed = createCampaignSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Неверные данные кампании.' });

      const advertiser = await advertiserProfile(request.authUser!.id);
      if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
      if (parsed.data.budgetKopecks > advertiser.balanceKopecks) {
        return reply.code(400).send({ error: 'Бюджет кампании превышает доступный баланс.' });
      }
      const surfaceInputs =
        parsed.data.surfaces ??
        supportedSurfaces.map((surface) => ({
          surface,
          cpmKopecks: parsed.data.cpmKopecks,
        }));
      if (new Set(surfaceInputs.map((item) => item.surface)).size !== surfaceInputs.length) {
        return reply.code(400).send({ error: 'Поверхности кампании не должны повторяться.' });
      }
      const surfaceRows = surfaceInputs.map((item) => ({
        ...item,
        billableCpmKopecks: billableCpmKopecks(item.cpmKopecks, parsed.data.format),
      }));
      const campaignBillableCpmKopecks = Math.max(
        ...surfaceRows.map((item) => item.billableCpmKopecks),
      );
      const cheapestImpression = Math.min(
        ...surfaceRows.map((item) => impressionCostKopecks(item.billableCpmKopecks)),
      );
      if (parsed.data.budgetKopecks < cheapestImpression) {
        return reply.code(400).send({ error: 'Бюджета недостаточно даже для одного показа.' });
      }
      if (parsed.data.deliveryMode === 'even' && !parsed.data.dailyBudgetKopecks) {
        return reply.code(400).send({ error: 'Для равномерной открутки укажите дневной бюджет.' });
      }
      if (
        parsed.data.dailyBudgetKopecks &&
        parsed.data.dailyBudgetKopecks > parsed.data.budgetKopecks
      ) {
        return reply.code(400).send({ error: 'Дневной бюджет не может превышать общий.' });
      }
      if (parsed.data.dailyBudgetKopecks && parsed.data.dailyBudgetKopecks < cheapestImpression) {
        return reply
          .code(400)
          .send({ error: 'Дневного бюджета недостаточно даже для одного показа.' });
      }
      if (
        parsed.data.startsAt &&
        parsed.data.endsAt &&
        parsed.data.endsAt <= parsed.data.startsAt
      ) {
        return reply.code(400).send({ error: 'Дата завершения должна быть позже даты начала.' });
      }
      const creativeInputs = (
        parsed.data.creatives ?? [
          {
            label: 'Основной',
            text: parsed.data.text,
            url: parsed.data.url,
            erid: parsed.data.erid ?? null,
          },
        ]
      ).map((creative) => ({
        ...creative,
        erid: creative.erid ?? parsed.data.erid ?? null,
      }));
      const primaryCreative = creativeInputs[0]!;

      const campaign = await prisma.campaign.create({
        data: {
          advertiserId: advertiser.id,
          name: parsed.data.name,
          // Legacy fields remain part of the public contract, but they must
          // always describe the first creative that moderation and delivery see.
          text: primaryCreative.text,
          url: primaryCreative.url,
          erid: primaryCreative.erid,
          selfPromotion: parsed.data.selfPromotion,
          ordPlatformId: parsed.data.ordPlatformId ?? null,
          status: 'pending',
          cpmKopecks: parsed.data.cpmKopecks,
          billableCpmKopecks: campaignBillableCpmKopecks,
          format: parsed.data.format,
          budgetKopecks: parsed.data.budgetKopecks,
          impressionsLimit: parsed.data.impressionsLimit ?? null,
          deliveryMode: parsed.data.deliveryMode,
          dailyBudgetKopecks: parsed.data.dailyBudgetKopecks ?? null,
          frequencyCapPerDay: parsed.data.frequencyCapPerDay ?? null,
          startsAt: parsed.data.startsAt ?? null,
          endsAt: parsed.data.endsAt ?? null,
          surfaces: {
            create: surfaceRows.map((item) => ({
              surface: item.surface,
              cpmKopecks: item.cpmKopecks,
              billableCpmKopecks: item.billableCpmKopecks,
            })),
          },
          creatives: { create: creativeInputs },
        },
        include: {
          advertiser: { select: { companyName: true } },
          surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
          creatives: { where: { enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });

      return reply.code(201).send({ campaign });
    },
  );

  app.get(
    '/v1/advertiser/campaigns',
    { preHandler: requireRole('advertiser') },
    async (request) => {
      const advertiser = await advertiserProfile(request.authUser!.id);
      const campaigns = advertiser
        ? await prisma.campaign.findMany({
            where: { advertiserId: advertiser.id },
            orderBy: { createdAt: 'desc' },
            include: {
              advertiser: { select: { companyName: true } },
              surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
              creatives: {
                where: { enabled: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              },
            },
          })
        : [];
      return { campaigns };
    },
  );

  app.get(
    '/v1/advertiser/campaigns/:id',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const advertiser = await advertiserProfile(request.authUser!.id);
      if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
      const campaign = await prisma.campaign.findFirst({
        where: { id, advertiserId: advertiser.id },
        include: {
          advertiser: { select: { companyName: true } },
          surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
          creatives: { where: { enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        },
      });
      if (!campaign) return reply.code(404).send({ error: 'Кампания не найдена.' });
      return { campaign };
    },
  );

  app.patch(
    '/v1/advertiser/campaigns/:id',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateCampaignSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Неверные изменения кампании.' });
      if (Object.keys(parsed.data).length === 0)
        return reply.code(400).send({ error: 'Нет изменений.' });
      const advertiser = await advertiserProfile(request.authUser!.id);
      if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
      const existing = await prisma.campaign.findFirst({
        where: { id, advertiserId: advertiser.id },
        include: {
          surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
          creatives: {
            where: { enabled: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
      if (!existing) return reply.code(404).send({ error: 'Кампания не найдена.' });
      if (
        parsed.data.impressionsLimit !== undefined &&
        parsed.data.impressionsLimit !== null &&
        parsed.data.impressionsLimit < existing.impressionsServed
      ) {
        return reply
          .code(400)
          .send({ error: 'Лимит показов не может быть меньше уже выполненных показов.' });
      }
      if (parsed.data.budgetKopecks !== undefined) {
        if (parsed.data.budgetKopecks < existing.spentKopecks) {
          return reply
            .code(400)
            .send({ error: 'Бюджет не может быть меньше уже потраченной суммы.' });
        }
        if (parsed.data.budgetKopecks > advertiser.balanceKopecks + existing.spentKopecks) {
          return reply.code(400).send({ error: 'Бюджет кампании превышает доступные средства.' });
        }
      }
      if (parsed.data.status && !['paused', 'pending'].includes(parsed.data.status)) {
        return reply.code(400).send({
          error: 'Рекламодатель может только приостановить или повторно отправить кампанию.',
        });
      }
      if (parsed.data.status === 'paused' && existing.status !== 'active') {
        return reply.code(409).send({ error: 'Приостановить можно только активную кампанию.' });
      }

      const deliveryChanged = Object.keys(parsed.data).some((key) => key !== 'status');
      const nextStatus = deliveryChanged ? 'pending' : parsed.data.status;
      const creativeChanges = parsed.data.creatives;
      const surfaceChanges = parsed.data.surfaces;
      const nextCpmKopecks = parsed.data.cpmKopecks ?? existing.cpmKopecks;
      const nextFormat = parsed.data.format ?? existing.format;
      let nextBillableCpmKopecks: number;
      let nextSurfaceRows: Array<{
        surface: (typeof supportedSurfaces)[number];
        cpmKopecks: number;
        billableCpmKopecks: number;
      }>;
      try {
        const inputs =
          surfaceChanges ??
          existing.surfaces.map((item) => ({
            surface: item.surface as (typeof supportedSurfaces)[number],
            cpmKopecks: parsed.data.cpmKopecks ?? item.cpmKopecks,
          }));
        if (new Set(inputs.map((item) => item.surface)).size !== inputs.length) {
          return reply.code(400).send({ error: 'Поверхности кампании не должны повторяться.' });
        }
        nextSurfaceRows = inputs.map((item) => ({
          ...item,
          billableCpmKopecks: billableCpmKopecks(item.cpmKopecks, nextFormat),
        }));
        nextBillableCpmKopecks = Math.max(
          ...nextSurfaceRows.map((item) => item.billableCpmKopecks),
        );
      } catch {
        return reply.code(400).send({ error: 'Итоговый CPM превышает допустимый предел.' });
      }
      const nextBudgetKopecks = parsed.data.budgetKopecks ?? existing.budgetKopecks;
      const nextDailyBudget =
        parsed.data.dailyBudgetKopecks === undefined
          ? existing.dailyBudgetKopecks
          : parsed.data.dailyBudgetKopecks;
      const nextDeliveryMode = parsed.data.deliveryMode ?? existing.deliveryMode;
      if (nextDeliveryMode === 'even' && !nextDailyBudget) {
        return reply.code(400).send({ error: 'Для равномерной открутки укажите дневной бюджет.' });
      }
      if (nextDailyBudget && nextDailyBudget > nextBudgetKopecks) {
        return reply.code(400).send({ error: 'Дневной бюджет не может превышать общий.' });
      }
      if (
        nextDailyBudget &&
        nextDailyBudget <
          Math.min(...nextSurfaceRows.map((item) => impressionCostKopecks(item.billableCpmKopecks)))
      ) {
        return reply
          .code(400)
          .send({ error: 'Дневного бюджета недостаточно даже для одного показа.' });
      }
      const nextStartsAt =
        parsed.data.startsAt === undefined ? existing.startsAt : parsed.data.startsAt;
      const nextEndsAt = parsed.data.endsAt === undefined ? existing.endsAt : parsed.data.endsAt;
      if (nextStartsAt && nextEndsAt && nextEndsAt <= nextStartsAt) {
        return reply.code(400).send({ error: 'Дата завершения должна быть позже даты начала.' });
      }
      if (
        deliveryChanged &&
        nextBudgetKopecks - existing.spentKopecks <
          Math.min(...nextSurfaceRows.map((item) => impressionCostKopecks(item.billableCpmKopecks)))
      ) {
        return reply
          .code(400)
          .send({ error: 'Остатка бюджета недостаточно для следующего показа.' });
      }
      const result = await prisma.$transaction(async (tx) => {
        await lockCampaignMutation(tx, id);
        const current = await tx.campaign.findFirst({
          where: { id, advertiserId: advertiser.id },
          select: { updatedAt: true },
        });
        if (!current) return { kind: 'not_found' as const };
        if (!sameCampaignRevision(current.updatedAt, existing.updatedAt)) {
          return { kind: 'conflict' as const };
        }

        const primaryCreative = creativeChanges?.[0];
        const updated = await tx.campaign.update({
          where: { id },
          data: {
            ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
            ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
            ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
            ...(parsed.data.erid !== undefined ? { erid: parsed.data.erid } : {}),
            ...(parsed.data.selfPromotion !== undefined
              ? { selfPromotion: parsed.data.selfPromotion }
              : {}),
            ...(parsed.data.ordPlatformId !== undefined
              ? { ordPlatformId: parsed.data.ordPlatformId }
              : {}),
            ...(parsed.data.budgetKopecks !== undefined
              ? { budgetKopecks: parsed.data.budgetKopecks }
              : {}),
            ...(parsed.data.impressionsLimit !== undefined
              ? { impressionsLimit: parsed.data.impressionsLimit }
              : {}),
            ...(parsed.data.deliveryMode !== undefined
              ? { deliveryMode: parsed.data.deliveryMode }
              : {}),
            ...(parsed.data.dailyBudgetKopecks !== undefined
              ? { dailyBudgetKopecks: parsed.data.dailyBudgetKopecks }
              : {}),
            ...(parsed.data.frequencyCapPerDay !== undefined
              ? { frequencyCapPerDay: parsed.data.frequencyCapPerDay }
              : {}),
            ...(parsed.data.startsAt !== undefined ? { startsAt: parsed.data.startsAt } : {}),
            ...(parsed.data.endsAt !== undefined ? { endsAt: parsed.data.endsAt } : {}),
            ...(primaryCreative
              ? {
                  text: primaryCreative.text,
                  url: primaryCreative.url,
                  erid: primaryCreative.erid ?? parsed.data.erid ?? null,
                }
              : {}),
            cpmKopecks: nextCpmKopecks,
            billableCpmKopecks: nextBillableCpmKopecks,
            format: nextFormat,
            autoPausedAt: null,
            pauseReason: null,
            ...(nextStatus ? { status: nextStatus } : {}),
          },
        });
        if (surfaceChanges) {
          await tx.campaignSurface.updateMany({
            where: { campaignId: id },
            data: { enabled: false },
          });
          for (const surface of nextSurfaceRows) {
            await tx.campaignSurface.upsert({
              where: { campaignId_surface: { campaignId: id, surface: surface.surface } },
              create: { campaignId: id, ...surface },
              update: { ...surface, enabled: true },
            });
          }
        } else if (parsed.data.cpmKopecks !== undefined || parsed.data.format !== undefined) {
          for (const surface of nextSurfaceRows) {
            await tx.campaignSurface.update({
              where: { campaignId_surface: { campaignId: id, surface: surface.surface } },
              data: {
                cpmKopecks: surface.cpmKopecks,
                billableCpmKopecks: surface.billableCpmKopecks,
              },
            });
          }
        }
        if (creativeChanges) {
          await tx.campaignCreative.updateMany({
            where: { campaignId: id },
            data: { enabled: false },
          });
          await tx.campaignCreative.createMany({
            data: creativeChanges.map((creative) => ({
              campaignId: id,
              ...creative,
              erid: creative.erid ?? parsed.data.erid ?? null,
            })),
          });
        } else if (
          parsed.data.text !== undefined ||
          parsed.data.url !== undefined ||
          parsed.data.erid !== undefined
        ) {
          const primaryCreative = existing.creatives[0];
          if (primaryCreative) {
            await tx.campaignCreative.update({
              where: { id: primaryCreative.id },
              data: {
                ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
                ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
                ...(parsed.data.erid !== undefined ? { erid: parsed.data.erid } : {}),
              },
            });
          } else {
            await tx.campaignCreative.create({
              data: {
                campaignId: id,
                label: 'Основной',
                text: parsed.data.text ?? existing.text,
                url: parsed.data.url ?? existing.url,
                erid: parsed.data.erid ?? existing.erid,
              },
            });
          }
        }
        const campaign = await tx.campaign.findUniqueOrThrow({
          where: { id: updated.id },
          include: {
            advertiser: { select: { companyName: true } },
            surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
            creatives: { where: { enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          },
        });
        return { kind: 'updated' as const, campaign };
      });
      if (result.kind === 'not_found') {
        return reply.code(404).send({ error: 'Кампания не найдена.' });
      }
      if (result.kind === 'conflict') {
        return reply
          .code(409)
          .send({ error: 'Кампания изменилась. Обновите данные и повторите запрос.' });
      }
      return { campaign: result.campaign };
    },
  );

  app.get('/v1/advertiser/stats', { preHandler: requireRole('advertiser') }, async (request) => {
    const advertiser = await advertiserProfile(request.authUser!.id);
    const campaigns = advertiser
      ? await prisma.campaign.findMany({
          where: { advertiserId: advertiser.id },
          orderBy: { createdAt: 'desc' },
          include: {
            advertiser: { select: { companyName: true } },
            surfaces: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
            creatives: { where: { enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          },
        })
      : [];
    return {
      companyName: advertiser?.companyName ?? null,
      publicName: advertiser?.publicName ?? null,
      campaigns,
      balanceKopecks: advertiser?.balanceKopecks ?? 0,
      totals: campaigns.reduce(
        (acc, campaign) => {
          acc.impressions += campaign.impressionsServed;
          acc.clicks += campaign.clicks;
          acc.spentKopecks += campaign.spentKopecks;
          return acc;
        },
        { impressions: 0, clicks: 0, spentKopecks: 0 },
      ),
    };
  });

  app.get('/v1/advertiser/balance', { preHandler: requireRole('advertiser') }, async (request) => {
    const advertiser = await advertiserProfile(request.authUser!.id);
    const ledger = await prisma.ledgerEntry.findMany({
      where: { userId: request.authUser!.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, type: true, amountKopecks: true, description: true, createdAt: true },
    });
    return { balanceKopecks: advertiser?.balanceKopecks ?? 0, ledger };
  });
}

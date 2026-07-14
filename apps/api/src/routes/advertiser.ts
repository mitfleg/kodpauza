import type { FastifyInstance } from 'fastify';
import {
  billableCpmKopecks,
  createCampaignSchema,
  impressionCostKopecks,
  updateCampaignSchema,
} from '@kodpauza/shared';
import { requireRole } from '../auth.js';
import { prisma } from '../prisma.js';

async function advertiserProfile(userId: string) {
  return prisma.advertiserProfile.findUnique({ where: { userId } });
}

export function registerAdvertiserRoutes(app: FastifyInstance) {
  app.post('/v1/advertiser/campaigns', { preHandler: requireRole('advertiser') }, async (request, reply) => {
    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверные данные кампании.' });

    const advertiser = await advertiserProfile(request.authUser!.id);
    if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
    if (parsed.data.budgetKopecks > advertiser.balanceKopecks) {
      return reply.code(400).send({ error: 'Бюджет кампании превышает доступный баланс.' });
    }
    const campaignBillableCpmKopecks = billableCpmKopecks(parsed.data.cpmKopecks, parsed.data.format);
    if (parsed.data.budgetKopecks < impressionCostKopecks(campaignBillableCpmKopecks)) {
      return reply.code(400).send({ error: 'Бюджета недостаточно даже для одного показа.' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: parsed.data.name,
        text: parsed.data.text,
        url: parsed.data.url,
        erid: null,
        status: 'pending',
        cpmKopecks: parsed.data.cpmKopecks,
        billableCpmKopecks: campaignBillableCpmKopecks,
        format: parsed.data.format,
        budgetKopecks: parsed.data.budgetKopecks,
        impressionsLimit: parsed.data.impressionsLimit ?? null,
      },
    });

    return reply.code(201).send({ campaign });
  });

  app.get('/v1/advertiser/campaigns', { preHandler: requireRole('advertiser') }, async (request) => {
    const advertiser = await advertiserProfile(request.authUser!.id);
    const campaigns = advertiser
      ? await prisma.campaign.findMany({ where: { advertiserId: advertiser.id }, orderBy: { createdAt: 'desc' } })
      : [];
    return { campaigns };
  });

  app.get('/v1/advertiser/campaigns/:id', { preHandler: requireRole('advertiser') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const advertiser = await advertiserProfile(request.authUser!.id);
    if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
    const campaign = await prisma.campaign.findFirst({ where: { id, advertiserId: advertiser.id } });
    if (!campaign) return reply.code(404).send({ error: 'Кампания не найдена.' });
    return { campaign };
  });

  app.patch('/v1/advertiser/campaigns/:id', { preHandler: requireRole('advertiser') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateCampaignSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверные изменения кампании.' });
    if (Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: 'Нет изменений.' });
    const advertiser = await advertiserProfile(request.authUser!.id);
    if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
    const existing = await prisma.campaign.findFirst({ where: { id, advertiserId: advertiser.id } });
    if (!existing) return reply.code(404).send({ error: 'Кампания не найдена.' });
    if (parsed.data.budgetKopecks !== undefined) {
      if (parsed.data.budgetKopecks < existing.spentKopecks) {
        return reply.code(400).send({ error: 'Бюджет не может быть меньше уже потраченной суммы.' });
      }
      if (parsed.data.budgetKopecks > advertiser.balanceKopecks + existing.spentKopecks) {
        return reply.code(400).send({ error: 'Бюджет кампании превышает доступные средства.' });
      }
    }
    if (parsed.data.status && !['paused', 'pending'].includes(parsed.data.status)) {
      return reply.code(400).send({ error: 'Рекламодатель может только приостановить или повторно отправить кампанию.' });
    }
    if (parsed.data.status === 'paused' && existing.status !== 'active') {
      return reply.code(409).send({ error: 'Приостановить можно только активную кампанию.' });
    }

    const deliveryChanged = Object.keys(parsed.data).some((key) => key !== 'status');
    const nextStatus = deliveryChanged ? 'pending' : parsed.data.status;
    const changes = { ...parsed.data };
    delete changes.status;
    delete changes.erid;
    const nextCpmKopecks = parsed.data.cpmKopecks ?? existing.cpmKopecks;
    const nextFormat = parsed.data.format ?? existing.format;
    let nextBillableCpmKopecks: number;
    try {
      nextBillableCpmKopecks = billableCpmKopecks(nextCpmKopecks, nextFormat);
    } catch {
      return reply.code(400).send({ error: 'Итоговый CPM превышает допустимый предел.' });
    }
    const nextBudgetKopecks = parsed.data.budgetKopecks ?? existing.budgetKopecks;
    if (
      deliveryChanged &&
      nextBudgetKopecks - existing.spentKopecks < impressionCostKopecks(nextBillableCpmKopecks)
    ) {
      return reply.code(400).send({ error: 'Остатка бюджета недостаточно для следующего показа.' });
    }
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...changes,
        billableCpmKopecks: nextBillableCpmKopecks,
        ...(nextStatus ? { status: nextStatus } : {}),
        erid: null,
      },
    });
    return { campaign };
  });

  app.get('/v1/advertiser/stats', { preHandler: requireRole('advertiser') }, async (request) => {
    const advertiser = await advertiserProfile(request.authUser!.id);
    const campaigns = advertiser
      ? await prisma.campaign.findMany({ where: { advertiserId: advertiser.id }, orderBy: { createdAt: 'desc' } })
      : [];
    return {
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

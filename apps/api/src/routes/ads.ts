import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { adPolicy, impressionCostKopecks, nextAdQuerySchema, rewardForImpression } from '@kodpauza/shared';
import { requireRole } from '../auth.js';
import { config } from '../config.js';
import { prisma } from '../prisma.js';

export function registerAdsRoutes(app: FastifyInstance) {
  app.get('/v1/ads/next', { preHandler: requireRole('developer') }, async (request, reply) => {
    const parsed = nextAdQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Неизвестное место показа.' });

    const campaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      orderBy: [{ billableCpmKopecks: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      include: { advertiser: { select: { balanceKopecks: true } } },
    });
    const campaign = campaigns.find((item) => {
      const costKopecks = impressionCostKopecks(item.billableCpmKopecks);
      const budgetOk = item.spentKopecks + costKopecks <= item.budgetKopecks;
      const balanceOk = item.advertiser.balanceKopecks >= costKopecks;
      const limitOk = item.impressionsLimit === null || item.impressionsServed < item.impressionsLimit;
      return budgetOk && balanceOk && limitOk;
    });

    if (!campaign) {
      return reply.code(204).send();
    }

    const adId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + config.adServeTtlMs);
    const costKopecks = impressionCostKopecks(campaign.billableCpmKopecks);
    const rewardKopecks = rewardForImpression(campaign.cpmKopecks, campaign.format);
    await prisma.adServe.create({
      data: {
        adId,
        userId: request.authUser!.id,
        campaignId: campaign.id,
        surface: parsed.data.surface,
        cpmKopecks: campaign.cpmKopecks,
        billableCpmKopecks: campaign.billableCpmKopecks,
        format: campaign.format,
        costKopecks,
        rewardKopecks,
        expiresAt,
      },
    });

    return {
      adId,
      campaignId: campaign.id,
      text: campaign.text,
      url: campaign.url,
      erid: campaign.erid,
      durationSec: adPolicy.impressionVisibleMs / 1000,
      surface: parsed.data.surface,
      format: campaign.format,
      trackable: true,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

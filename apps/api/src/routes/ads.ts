import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import {
  accrueDeveloperReward,
  accrueImpressionCharge,
  adPolicy,
  nextAdQuerySchema,
} from '@kodpauza/shared';
import { requireRole } from '../auth.js';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { AD_ROTATION_HISTORY_SIZE, selectRotatedCampaign } from '../services/adRotation.js';
import {
  deliveryAnomalyReason,
  deliveryEligibility,
  moscowDeliveryDay,
} from '../services/campaignDelivery.js';
import { selectCampaignCreative } from '../services/creativeRotation.js';
import {
  createRuntimePolicyPayload,
  runtimePolicyAllows,
  runtimeToolForSurface,
} from '../services/runtimePolicy.js';

export function registerAdsRoutes(app: FastifyInstance) {
  app.get('/v1/ads/next', { preHandler: requireRole('developer') }, async (request, reply) => {
    const parsed = nextAdQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Неизвестное место показа.' });

    const runtimePolicy = createRuntimePolicyPayload();
    const runtimeContext = {
      tool: runtimeToolForSurface(parsed.data.surface),
      version: parsed.data.toolVersion,
      surface: parsed.data.surface,
    } as const;
    if (!runtimePolicyAllows(runtimeContext, runtimePolicy)) {
      return reply.code(204).send();
    }

    const developer = await prisma.developerProfile.findUnique({
      where: { userId: request.authUser!.id },
      select: { rewardRemainderUnits: true },
    });
    if (!developer) return reply.code(403).send({ error: 'Показы доступны только разработчику.' });

    const now = new Date();
    const { start: deliveryDay } = moscowDeliveryDay(now);
    const placements = await prisma.campaignSurface.findMany({
      where: {
        surface: parsed.data.surface,
        enabled: true,
        campaign: {
          is: {
            status: 'active',
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
            creatives: { some: { enabled: true } },
          },
        },
      },
      orderBy: [{ billableCpmKopecks: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      include: {
        campaign: {
          include: {
            advertiser: { select: { balanceKopecks: true, companyName: true } },
            creatives: {
              where: { enabled: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
    });
    const campaigns = placements.map(({ campaign, ...placement }) => ({
      ...campaign,
      surfaces: [placement],
    }));

    const campaignIds = campaigns.map((campaign) => campaign.id);
    const [deliveryRows, userFrequency, recentAnomalies] = campaignIds.length
      ? await Promise.all([
          prisma.campaignDeliveryDay.findMany({
            where: { campaignId: { in: campaignIds }, day: deliveryDay },
            select: { campaignId: true, spentKopecks: true },
          }),
          prisma.adEvent.groupBy({
            by: ['campaignId'],
            where: {
              campaignId: { in: campaignIds },
              userId: request.authUser!.id,
              type: 'impression',
              fraudStatus: 'clean',
              createdAt: { gte: deliveryDay },
            },
            _count: { _all: true },
          }),
          prisma.adEvent.groupBy({
            by: ['campaignId', 'type', 'fraudStatus', 'userId', 'ipHash'],
            where: {
              campaignId: { in: campaignIds },
              createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1_000) },
            },
            _count: { _all: true },
          }),
        ])
      : [[], [], []] as const;
    const spentToday = new Map(deliveryRows.map((row) => [row.campaignId, row.spentKopecks]));
    const frequencyToday = new Map(userFrequency.map((row) => [row.campaignId, row._count._all]));
    const anomalyByCampaign = new Map<string, {
      impressions: number;
      clicks: number;
      suspiciousImpressions: number;
      users: Set<string>;
      ips: Set<string>;
    }>();
    for (const row of recentAnomalies) {
      const current = anomalyByCampaign.get(row.campaignId) ?? {
        impressions: 0,
        clicks: 0,
        suspiciousImpressions: 0,
        users: new Set<string>(),
        ips: new Set<string>(),
      };
      current.users.add(row.userId);
      if (row.ipHash) current.ips.add(row.ipHash);
      if (row.type === 'impression') {
        current.impressions += row._count._all;
        if (row.fraudStatus === 'suspicious') current.suspiciousImpressions += row._count._all;
      } else if (row.type === 'click' && row.fraudStatus === 'clean') {
        current.clicks += row._count._all;
      }
      anomalyByCampaign.set(row.campaignId, current);
    }
    const anomalyReasons = new Map<string, 'fraud_spike' | 'ctr_spike'>();
    for (const [campaignId, counters] of anomalyByCampaign) {
      const reason = deliveryAnomalyReason({
        impressions: counters.impressions,
        clicks: counters.clicks,
        suspiciousImpressions: counters.suspiciousImpressions,
        distinctUsers: counters.users.size,
        distinctIps: counters.ips.size,
      });
      if (reason) anomalyReasons.set(campaignId, reason);
    }
    for (const reason of ['fraud_spike', 'ctr_spike'] as const) {
      const ids = [...anomalyReasons].filter((entry) => entry[1] === reason).map((entry) => entry[0]);
      if (ids.length > 0) {
        await prisma.campaign.updateMany({
          where: { id: { in: ids }, status: 'active' },
          data: { status: 'paused', autoPausedAt: now, pauseReason: reason },
        });
      }
    }
    const eligibleCampaigns = campaigns.filter((item) => {
      if (!runtimePolicyAllows({ ...runtimeContext, campaignId: item.id }, runtimePolicy)) {
        return false;
      }
      if (anomalyReasons.has(item.id)) return false;
      const placement = item.surfaces[0];
      if (!placement) return false;
      const costKopecks = accrueImpressionCharge(
        placement.billableCpmKopecks,
        item.billingRemainderMilliKopecks,
      ).amountKopecks;
      const balanceOk = item.advertiser.balanceKopecks >= costKopecks;
      const limitOk = item.impressionsLimit === null || item.impressionsServed < item.impressionsLimit;
      const frequencyOk =
        item.frequencyCapPerDay === null ||
        (frequencyToday.get(item.id) ?? 0) < item.frequencyCapPerDay;
      const delivery = deliveryEligibility({
        now,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        mode: item.deliveryMode,
        nextCostKopecks: costKopecks,
        remainingBudgetKopecks: item.budgetKopecks - item.spentKopecks,
        dailyBudgetKopecks: item.dailyBudgetKopecks,
        spentTodayKopecks: spentToday.get(item.id) ?? 0,
      });
      return balanceOk && limitOk && frequencyOk && delivery.eligible;
    }).map((campaign) => ({
      ...campaign,
      billableCpmKopecks: campaign.surfaces[0]!.billableCpmKopecks,
    }));

    if (eligibleCampaigns.length === 0) {
      return reply.code(204).send();
    }

    const serveHistory = await prisma.adServe.findMany({
      where: {
        userId: request.authUser!.id,
        campaignId: { in: eligibleCampaigns.map((campaign) => campaign.id) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: AD_ROTATION_HISTORY_SIZE,
      select: { campaignId: true, creativeId: true },
    });
    const campaign = selectRotatedCampaign(eligibleCampaigns, serveHistory);
    if (!campaign) return reply.code(204).send();
    const creative = selectCampaignCreative(
      campaign.creatives,
      serveHistory.filter((serve) => serve.campaignId === campaign.id),
    );
    if (!creative) return reply.code(204).send();
    const placement = campaign.surfaces[0]!;

    const adId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + config.adServeTtlMs);
    // These values are a preview for diagnostics. The transaction that records
    // the impression recalculates them from the then-current persisted
    // remainders and stores the actual amounts on the serve.
    const costKopecks = accrueImpressionCharge(
      placement.billableCpmKopecks,
      campaign.billingRemainderMilliKopecks,
    ).amountKopecks;
    const rewardKopecks = accrueDeveloperReward(
      placement.billableCpmKopecks,
      developer.rewardRemainderUnits,
    ).amountKopecks;
    await prisma.adServe.create({
      data: {
        adId,
        userId: request.authUser!.id,
        campaignId: campaign.id,
        creativeId: creative.id,
        surface: parsed.data.surface,
        cpmKopecks: placement.cpmKopecks,
        billableCpmKopecks: placement.billableCpmKopecks,
        format: campaign.format,
        costKopecks,
        rewardKopecks,
        expiresAt,
      },
    });

    return {
      adId,
      campaignId: campaign.id,
      creativeId: creative.id,
      text: creative.text,
      url: creative.url,
      erid: campaign.erid,
      advertiserName: campaign.advertiser.companyName,
      durationSec: adPolicy.impressionVisibleMs / 1000,
      surface: parsed.data.surface,
      format: campaign.format,
      trackable: true,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

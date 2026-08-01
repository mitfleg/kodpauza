import type { Prisma } from '@prisma/client';
import { adPolicy, type ImpressionQuotaTier } from '@kodpauza/shared';
import { concurrentSharedIpIncomeReason } from './fraud.js';

type ImpressionQuotaStore = Pick<Prisma.TransactionClient, 'adEvent' | 'fraudFlag' | 'user'>;

const DAY_MS = 24 * 60 * 60 * 1_000;
const BASIS_POINTS = 10_000;

export type ImpressionQuotaSnapshot = {
  tier: ImpressionQuotaTier;
  hour: { used: number; limit: number; remaining: number };
  rollingDay: { used: number; limit: number; remaining: number };
  capped: boolean;
  exhausted: 'hour' | 'rolling_day' | null;
};

export async function getImpressionQuotaSnapshot(
  store: ImpressionQuotaStore,
  userId: string,
  now = new Date(),
): Promise<ImpressionQuotaSnapshot> {
  const hourStart = new Date(now.getTime() - 60 * 60 * 1_000);
  const rollingDayStart = new Date(now.getTime() - DAY_MS);
  const riskWindowStart = new Date(now.getTime() - adPolicy.quotaRiskWindowDays * DAY_MS);

  const account = await store.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      emailVerifiedAt: true,
      developerProfile: { select: { totalImpressions: true } },
    },
  });
  const accountAgeDays = account
    ? Math.floor((now.getTime() - account.createdAt.getTime()) / DAY_MS)
    : 0;
  const totalCleanImpressions = account?.developerProfile?.totalImpressions ?? 0;
  const trustedPolicy = adPolicy.impressionQuotaTiers.trusted;
  const canReachElevatedTier =
    Boolean(account?.emailVerifiedAt) &&
    accountAgeDays >= trustedPolicy.minimumAccountAgeDays &&
    totalCleanImpressions >= trustedPolicy.minimumCleanImpressions;

  const [hourUsed, rollingDayUsed, recentImpressions, blockingRisk] = await Promise.all([
    cleanImpressionCount(store, userId, hourStart),
    cleanImpressionCount(store, userId, rollingDayStart),
    canReachElevatedTier
      ? store.adEvent.groupBy({
          by: ['fraudStatus'],
          where: {
            userId,
            type: 'impression',
            createdAt: { gte: riskWindowStart },
            OR: [
              { fraudStatus: 'clean' },
              {
                fraudStatus: 'suspicious',
                fraudFlags: {
                  none: {
                    OR: [
                      { reason: { contains: 'hour_limit_exceeded' } },
                      { reason: { contains: 'day_limit_exceeded' } },
                    ],
                  },
                },
              },
            ],
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    canReachElevatedTier
      ? store.fraudFlag.findFirst({
          where: {
            userId,
            createdAt: { gte: riskWindowStart },
            OR: [{ severity: 'high' }, { reason: { contains: concurrentSharedIpIncomeReason } }],
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const cleanRecent =
    recentImpressions.find((entry) => entry.fraudStatus === 'clean')?._count._all ?? 0;
  const suspiciousRecent =
    recentImpressions.find((entry) => entry.fraudStatus === 'suspicious')?._count._all ?? 0;
  const recentTotal = cleanRecent + suspiciousRecent;
  const suspiciousRatioBps = recentTotal
    ? Math.floor((suspiciousRecent * BASIS_POINTS) / recentTotal)
    : 0;
  const tier = selectImpressionQuotaTier({
    accountAgeDays,
    emailVerified: Boolean(account?.emailVerifiedAt),
    totalCleanImpressions,
    recentSuspiciousRatioBps: suspiciousRatioBps,
    hasBlockingRisk: Boolean(blockingRisk),
  });
  const rollingDayLimit = adPolicy.impressionQuotaTiers[tier].rollingDayPaidImpressionLimit;
  const hourRemaining = Math.max(0, adPolicy.hourlyPaidImpressionLimit - hourUsed);
  const rollingDayRemaining = Math.max(0, rollingDayLimit - rollingDayUsed);
  const exhausted = hourRemaining === 0 ? 'hour' : rollingDayRemaining === 0 ? 'rolling_day' : null;

  return {
    tier,
    hour: {
      used: hourUsed,
      limit: adPolicy.hourlyPaidImpressionLimit,
      remaining: hourRemaining,
    },
    rollingDay: {
      used: rollingDayUsed,
      limit: rollingDayLimit,
      remaining: rollingDayRemaining,
    },
    capped: exhausted !== null,
    exhausted,
  };
}

export function selectImpressionQuotaTier(input: {
  accountAgeDays: number;
  emailVerified: boolean;
  totalCleanImpressions: number;
  recentSuspiciousRatioBps: number;
  hasBlockingRisk: boolean;
}): ImpressionQuotaTier {
  if (!input.emailVerified || input.hasBlockingRisk) return 'starter';

  const eligible = (tier: 'trusted' | 'mature') => {
    const policy = adPolicy.impressionQuotaTiers[tier];
    return (
      input.accountAgeDays >= policy.minimumAccountAgeDays &&
      input.totalCleanImpressions >= policy.minimumCleanImpressions &&
      input.recentSuspiciousRatioBps < policy.maximumRecentSuspiciousRatioBps
    );
  };

  if (eligible('mature')) return 'mature';
  if (eligible('trusted')) return 'trusted';
  return 'starter';
}

function cleanImpressionCount(
  store: ImpressionQuotaStore,
  userId: string,
  since: Date,
): Promise<number> {
  return store.adEvent.count({
    where: {
      userId,
      type: 'impression',
      fraudStatus: 'clean',
      createdAt: { gte: since },
    },
  });
}

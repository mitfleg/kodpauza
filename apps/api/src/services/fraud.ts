import type { Prisma } from '@prisma/client';
import { adPolicy } from '@kodpauza/shared';

type FraudStore = Pick<Prisma.TransactionClient, 'adEvent' | '$executeRaw'>;

export const concurrentSharedIpIncomeReason = 'concurrent_shared_ip_income';

export type FraudDecision = {
  status: 'clean' | 'suspicious' | 'rejected';
  reasons: string[];
  concurrentAccount?: {
    userId: string;
    eventAt: Date;
  };
};

export async function assessImpression(
  prisma: FraudStore,
  userId: string,
  visibleMs: number,
  ipHash: string | null,
  observedAt: Date,
): Promise<FraudDecision> {
  if (visibleMs < adPolicy.impressionVisibleMs) {
    return { status: 'rejected', reasons: ['visible_ms_less_than_5000'] };
  }

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const minimumIntervalAgo = new Date(
    now.getTime() - adPolicy.minimumSecondsBetweenPaidImpressions * 1000,
  );
  const concurrentWindowStart = new Date(observedAt.getTime() - adPolicy.impressionVisibleMs);

  // Serializing contenders makes concurrent requests deterministic: after the first
  // transaction commits, the next one can see its paid event in the same display window.
  if (ipHash) await lockIncomeIp(prisma, ipHash);

  const [hourCount, dayCount, recentCount, concurrentAccount] = await Promise.all([
    prisma.adEvent.count({
      where: { userId, type: 'impression', fraudStatus: 'clean', createdAt: { gte: hourAgo } },
    }),
    prisma.adEvent.count({
      where: { userId, type: 'impression', fraudStatus: 'clean', createdAt: { gte: dayAgo } },
    }),
    prisma.adEvent.count({
      where: { userId, type: 'impression', createdAt: { gte: minimumIntervalAgo } },
    }),
    ipHash
      ? prisma.adEvent.findFirst({
          where: {
            ipHash,
            type: 'impression',
            fraudStatus: 'clean',
            rewardKopecks: { gt: 0 },
            userId: { not: userId },
            createdAt: { gte: concurrentWindowStart },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { userId: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  const reasons: string[] = [];
  if (hourCount >= adPolicy.hourlyPaidImpressionLimit) reasons.push('hour_limit_exceeded');
  if (dayCount >= adPolicy.rollingDayPaidImpressionLimit) reasons.push('day_limit_exceeded');
  if (recentCount > 0) reasons.push('too_frequent');
  if (visibleMs > 60000) reasons.push('visible_ms_too_large');
  if (concurrentAccount) reasons.push(concurrentSharedIpIncomeReason);

  return {
    status: reasons.length ? 'suspicious' : 'clean',
    reasons,
    concurrentAccount: concurrentAccount
      ? { userId: concurrentAccount.userId, eventAt: concurrentAccount.createdAt }
      : undefined,
  };
}

export async function assessClick(prisma: FraudStore, userId: string): Promise<FraudDecision> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourClicks = await prisma.adEvent.count({
    where: { userId, type: 'click', createdAt: { gte: hourAgo } },
  });
  return hourClicks >= 30
    ? { status: 'suspicious', reasons: ['too_many_clicks'] }
    : { status: 'clean', reasons: [] };
}

async function lockIncomeIp(prisma: FraudStore, ipHash: string): Promise<void> {
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`income-ip:${ipHash}`}))`;
}

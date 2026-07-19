const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type DeliveryMode = 'asap' | 'even';

export type DeliveryEligibilityInput = {
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  mode: DeliveryMode;
  nextCostKopecks: number;
  remainingBudgetKopecks: number;
  dailyBudgetKopecks: number | null;
  spentTodayKopecks: number;
};

export type DeliveryAnomalyInput = {
  impressions: number;
  clicks: number;
  suspiciousImpressions: number;
  distinctUsers: number;
  distinctIps: number;
};

export const minimumDeliveryAnomalyUsers = 3;

export function moscowDeliveryDay(now: Date): { key: Date; start: Date; end: Date } {
  const shifted = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  const start = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
      MOSCOW_OFFSET_MS,
  );
  return { key: start, start, end: new Date(start.getTime() + DAY_MS) };
}

export function deliveryEligibility(input: DeliveryEligibilityInput): {
  eligible: boolean;
  reason?: 'not_started' | 'ended' | 'budget' | 'daily_budget' | 'pacing';
} {
  if (input.startsAt && input.now < input.startsAt) return { eligible: false, reason: 'not_started' };
  if (input.endsAt && input.now >= input.endsAt) return { eligible: false, reason: 'ended' };
  if (input.nextCostKopecks > input.remainingBudgetKopecks) {
    return { eligible: false, reason: 'budget' };
  }
  if (input.dailyBudgetKopecks === null) return { eligible: true };
  if (input.spentTodayKopecks + input.nextCostKopecks > input.dailyBudgetKopecks) {
    return { eligible: false, reason: 'daily_budget' };
  }
  if (input.mode === 'asap') return { eligible: true };

  const { start } = moscowDeliveryDay(input.now);
  const elapsedMs = Math.max(0, Math.min(DAY_MS, input.now.getTime() - start.getTime()));
  const numerator = BigInt(input.dailyBudgetKopecks) * BigInt(elapsedMs);
  const denominator = BigInt(DAY_MS);
  const proportionalAllowance = Number((numerator + denominator - 1n) / denominator);
  const allowedNow = Math.min(
    input.dailyBudgetKopecks,
    Math.max(input.nextCostKopecks, proportionalAllowance),
  );
  if (input.spentTodayKopecks + input.nextCostKopecks > allowedNow) {
    return { eligible: false, reason: 'pacing' };
  }
  return { eligible: true };
}

export function deliveryAnomalyReason(
  input: DeliveryAnomalyInput,
): 'fraud_spike' | 'ctr_spike' | undefined {
  if (input.impressions < 20) return undefined;
  if (input.distinctUsers < minimumDeliveryAnomalyUsers) return undefined;
  if (input.distinctIps < minimumDeliveryAnomalyUsers) return undefined;
  if (input.suspiciousImpressions * 2 >= input.impressions) return 'fraud_spike';
  if (input.clicks * 2 > input.impressions) return 'ctr_spike';
  return undefined;
}

import { describe, expect, it } from 'vitest';
import {
  deliveryAnomalyReason,
  deliveryEligibility,
  moscowDeliveryDay,
} from '../src/services/campaignDelivery.js';

describe('campaign delivery controls', () => {
  it('строит сутки по Москве, а не по UTC сервера', () => {
    const day = moscowDeliveryDay(new Date('2026-07-19T22:30:00.000Z'));
    expect(day.start.toISOString()).toBe('2026-07-19T21:00:00.000Z');
    expect(day.end.toISOString()).toBe('2026-07-20T21:00:00.000Z');
  });

  it('учитывает расписание, общий и дневной бюджет', () => {
    const base = {
      now: new Date('2026-07-19T09:00:00.000Z'),
      startsAt: null,
      endsAt: null,
      mode: 'asap' as const,
      nextCostKopecks: 3,
      remainingBudgetKopecks: 100,
      dailyBudgetKopecks: 50,
      spentTodayKopecks: 47,
    };
    expect(deliveryEligibility(base)).toEqual({ eligible: true });
    expect(deliveryEligibility({ ...base, spentTodayKopecks: 48 }).reason).toBe('daily_budget');
    expect(deliveryEligibility({ ...base, remainingBudgetKopecks: 2 }).reason).toBe('budget');
    expect(deliveryEligibility({ ...base, startsAt: new Date('2026-07-20T00:00:00Z') }).reason).toBe('not_started');
  });

  it('распределяет even-бюджет по времени суток без блокировки первого показа', () => {
    const input = {
      now: new Date('2026-07-18T21:00:01.000Z'),
      startsAt: null,
      endsAt: null,
      mode: 'even' as const,
      nextCostKopecks: 3,
      remainingBudgetKopecks: 10_000,
      dailyBudgetKopecks: 2_400,
      spentTodayKopecks: 0,
    };
    expect(deliveryEligibility(input)).toEqual({ eligible: true });
    expect(deliveryEligibility({ ...input, spentTodayKopecks: 3 }).reason).toBe('pacing');
  });

  it('точно считает pacing для больших бюджетов без потери копейки в Number', () => {
    const proportionalAllowance = 1_800_205_742;
    expect(deliveryEligibility({
      now: new Date('2026-07-19T18:36:17.777Z'),
      startsAt: null,
      endsAt: null,
      mode: 'even',
      nextCostKopecks: 2,
      remainingBudgetKopecks: 1_999_771_426,
      dailyBudgetKopecks: 1_999_771_426,
      spentTodayKopecks: proportionalAllowance - 2,
    })).toEqual({ eligible: true });
  });

  it('автоматически отмечает только статистически заметные аномалии', () => {
    expect(deliveryAnomalyReason({
      impressions: 19,
      clicks: 19,
      suspiciousImpressions: 19,
      distinctUsers: 3,
      distinctIps: 3,
    })).toBeUndefined();
    expect(deliveryAnomalyReason({
      impressions: 20,
      clicks: 1,
      suspiciousImpressions: 20,
      distinctUsers: 1,
      distinctIps: 1,
    })).toBeUndefined();
    expect(deliveryAnomalyReason({
      impressions: 20,
      clicks: 20,
      suspiciousImpressions: 0,
      distinctUsers: 1,
      distinctIps: 1,
    })).toBeUndefined();
    expect(deliveryAnomalyReason({
      impressions: 20,
      clicks: 1,
      suspiciousImpressions: 10,
      distinctUsers: 3,
      distinctIps: 1,
    })).toBeUndefined();
    expect(deliveryAnomalyReason({
      impressions: 20,
      clicks: 1,
      suspiciousImpressions: 10,
      distinctUsers: 3,
      distinctIps: 3,
    })).toBe('fraud_spike');
    expect(deliveryAnomalyReason({
      impressions: 20,
      clicks: 11,
      suspiciousImpressions: 0,
      distinctUsers: 3,
      distinctIps: 3,
    })).toBe('ctr_spike');
  });
});

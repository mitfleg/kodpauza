import { describe, expect, it } from 'vitest';
import { selectImpressionQuotaTier } from '../src/services/impressionQuota.js';

describe('selectImpressionQuotaTier', () => {
  const eligible = {
    emailVerified: true,
    recentSuspiciousRatioBps: 0,
    hasBlockingRisk: false,
  } as const;

  it('оставляет новый аккаунт на базовой квоте', () => {
    expect(
      selectImpressionQuotaTier({
        ...eligible,
        accountAgeDays: 13,
        totalCleanImpressions: 499,
      }),
    ).toBe('starter');
  });

  it('повышает стабильный аккаунт до trusted', () => {
    expect(
      selectImpressionQuotaTier({
        ...eligible,
        accountAgeDays: 14,
        totalCleanImpressions: 500,
        recentSuspiciousRatioBps: 99,
      }),
    ).toBe('trusted');
  });

  it('не повышает аккаунт при подозрительной доле ровно один процент', () => {
    expect(
      selectImpressionQuotaTier({
        ...eligible,
        accountAgeDays: 14,
        totalCleanImpressions: 500,
        recentSuspiciousRatioBps: 100,
      }),
    ).toBe('starter');
  });

  it('повышает зрелый аккаунт до mature', () => {
    expect(
      selectImpressionQuotaTier({
        ...eligible,
        accountAgeDays: 30,
        totalCleanImpressions: 2_500,
        recentSuspiciousRatioBps: 49,
      }),
    ).toBe('mature');
  });

  it('сбрасывает повышенный уровень при блокирующем риске или неподтвержденной почте', () => {
    const matureAccount = {
      ...eligible,
      accountAgeDays: 90,
      totalCleanImpressions: 10_000,
    };
    expect(selectImpressionQuotaTier({ ...matureAccount, hasBlockingRisk: true })).toBe('starter');
    expect(selectImpressionQuotaTier({ ...matureAccount, emailVerified: false })).toBe('starter');
  });
});

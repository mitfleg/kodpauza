import { describe, expect, it } from 'vitest';
import {
  accrueDeveloperReward,
  accrueImpressionCharge,
  billableCpmKopecks,
  createCampaignSchema,
  impressionCostKopecks,
  legalDocumentVersions,
  nextAdQuerySchema,
  registerSchema,
  rewardForImpression,
  surfaceSchema,
  updateCampaignSchema,
} from './index.js';

describe('shared helpers', () => {
  it('считает условное вознаграждение за показ', () => {
    expect(impressionCostKopecks(30000)).toBe(30);
    expect(rewardForImpression(30000)).toBe(15);
    expect(billableCpmKopecks(30000, 'premium')).toBe(45000);
    expect(rewardForImpression(30000, 'premium')).toBe(22);
  });

  it('без потерь распределяет минимальный CPM на тысячу показов', () => {
    let chargeRemainder = 0;
    let rewardRemainder = 0;
    let charged = 0;
    let rewarded = 0;

    for (let impression = 0; impression < 1_000; impression += 1) {
      const charge = accrueImpressionCharge(2_000, chargeRemainder);
      const reward = accrueDeveloperReward(2_000, rewardRemainder);
      charged += charge.amountKopecks;
      rewarded += reward.amountKopecks;
      chargeRemainder = charge.remainderUnits;
      rewardRemainder = reward.remainderUnits;
    }

    expect({ charged, rewarded, platform: charged - rewarded }).toEqual({
      charged: 2_000,
      rewarded: 1_000,
      platform: 1_000,
    });
    expect({ chargeRemainder, rewardRemainder }).toEqual({
      chargeRemainder: 0,
      rewardRemainder: 0,
    });
  });

  it('чередует дробные копейки премиального CPM и сохраняет долю 50/50', () => {
    let chargeRemainder = 0;
    let rewardRemainder = 0;
    const rewards: number[] = [];
    let charged = 0;

    for (let impression = 0; impression < 1_000; impression += 1) {
      const charge = accrueImpressionCharge(3_000, chargeRemainder);
      const reward = accrueDeveloperReward(3_000, rewardRemainder);
      charged += charge.amountKopecks;
      rewards.push(reward.amountKopecks);
      chargeRemainder = charge.remainderUnits;
      rewardRemainder = reward.remainderUnits;
    }

    expect(charged).toBe(3_000);
    expect(rewards.reduce((total, reward) => total + reward, 0)).toBe(1_500);
    expect(new Set(rewards)).toEqual(new Set([1, 2]));
  });

  it('переносит остатки для CPM и долей, не кратных одной копейке', () => {
    let chargeRemainder = 0;
    let rewardRemainder = 0;
    let charged = 0;
    let rewarded = 0;

    for (let impression = 0; impression < 2_000; impression += 1) {
      const charge = accrueImpressionCharge(2_001, chargeRemainder);
      const reward = accrueDeveloperReward(2_001, rewardRemainder, 3_333);
      charged += charge.amountKopecks;
      rewarded += reward.amountKopecks;
      chargeRemainder = charge.remainderUnits;
      rewardRemainder = reward.remainderUnits;
    }

    expect(charged).toBe(Math.floor((2_000 * 2_001) / 1_000));
    expect(rewarded).toBe(Math.floor((2_000 * 2_001 * 3_333) / 10_000_000));
  });

  it('проверяет место показа', () => {
    expect(surfaceSchema.safeParse('demo_adapter').success).toBe(false);
    expect(surfaceSchema.safeParse('vscode_status_bar').success).toBe(false);
    expect(surfaceSchema.safeParse('unknown').success).toBe(false);
  });

  it('не допускает нулевое вознаграждение и небезопасную ссылку', () => {
    const base = {
      name: 'Тестовая кампания',
      text: 'Инфраструктура для разработчиков',
      url: 'https://example.ru',
      budgetKopecks: 100_000,
      cpmKopecks: 2_000,
    };
    expect(createCampaignSchema.safeParse(base).success).toBe(true);
    expect(createCampaignSchema.safeParse({ ...base, erid: '' }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ ...base, erid: '123' }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, cpmKopecks: 1999 }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, name: 'К'.repeat(41) }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, url: 'file:///tmp/ad' }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, text: 'Реклама:' }).success).toBe(false);
    expect(
      createCampaignSchema.safeParse({
        ...base,
        creatives: [{ label: 'A', text: 'Advertisement:', url: 'https://example.ru' }],
      }).success,
    ).toBe(false);
  });

  it('отклоняет неизвестные поля вместо молчаливого значения по умолчанию', () => {
    expect(nextAdQuerySchema.safeParse({ placement: 'codex_vscode' }).success).toBe(false);
  });

  it('использует рабочее место показа Codex для запроса объявления', () => {
    expect(nextAdQuerySchema.parse({})).toEqual({
      surface: 'codex_vscode',
      toolVersion: 'unknown',
    });
    expect(
      nextAdQuerySchema.parse({ surface: 'codex_vscode', toolVersion: '26.707.91948' }),
    ).toEqual({ surface: 'codex_vscode', toolVersion: '26.707.91948' });
  });

  it('не сбрасывает премиальный формат при частичном изменении кампании', () => {
    expect(updateCampaignSchema.parse({ text: 'Обновленный текст объявления' })).not.toHaveProperty('format');
  });

  it('требует отдельные актуальные согласия при регистрации', () => {
    const base = {
      email: 'legal@example.ru',
      password: 'password123',
      role: 'developer' as const,
      captchaToken: 'captcha-token',
      termsAccepted: true as const,
      termsVersion: legalDocumentVersions.terms,
      privacyAcknowledged: true as const,
      privacyVersion: legalDocumentVersions.privacy,
      personalDataConsentAccepted: true as const,
      personalDataConsentVersion: legalDocumentVersions.personalDataConsent,
    };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, personalDataConsentAccepted: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, termsVersion: 'old-version' }).success).toBe(false);
  });
});

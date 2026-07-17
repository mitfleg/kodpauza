import { describe, expect, it } from 'vitest';
import {
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
    expect(createCampaignSchema.safeParse({ ...base, url: 'file:///tmp/ad' }).success).toBe(false);
  });

  it('отклоняет неизвестные поля вместо молчаливого значения по умолчанию', () => {
    expect(nextAdQuerySchema.safeParse({ placement: 'codex_vscode' }).success).toBe(false);
  });

  it('использует рабочее место показа Codex для запроса объявления', () => {
    expect(nextAdQuerySchema.parse({}).surface).toBe('codex_vscode');
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

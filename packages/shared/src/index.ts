import { z } from 'zod';
export {
  legalDocumentVersions,
  registrationLegalDocuments,
  type RegistrationLegalDocumentType,
} from './legal.js';
import { legalDocumentVersions } from './legal.js';

export const surfaces = ['claude_code_vscode', 'codex_vscode'] as const;

export const roles = ['developer', 'advertiser', 'admin'] as const;
export const campaignStatuses = ['draft', 'pending', 'active', 'paused', 'rejected'] as const;
export const campaignFormats = ['standard', 'premium'] as const;
export const campaignDeliveryModes = ['asap', 'even'] as const;

export const advertiserTopUpLimits = {
  minimumKopecks: 100,
  maximumKopecks: 1_000_000_000,
} as const;

export const adPolicy = {
  version: '1.1',
  impressionVisibleMs: 5_000,
  minimumSecondsBetweenPaidImpressions: 10,
  hourlyPaidImpressionLimit: 60,
  // Kept as the public baseline for backwards compatibility. Eligible
  // developers receive a higher rolling limit from impressionQuotaTiers.
  rollingDayPaidImpressionLimit: 300,
  impressionQuotaTiers: {
    starter: {
      rollingDayPaidImpressionLimit: 300,
      minimumAccountAgeDays: 0,
      minimumCleanImpressions: 0,
      maximumRecentSuspiciousRatioBps: 10_000,
    },
    trusted: {
      rollingDayPaidImpressionLimit: 450,
      minimumAccountAgeDays: 14,
      minimumCleanImpressions: 500,
      maximumRecentSuspiciousRatioBps: 100,
    },
    mature: {
      rollingDayPaidImpressionLimit: 600,
      minimumAccountAgeDays: 30,
      minimumCleanImpressions: 2_500,
      maximumRecentSuspiciousRatioBps: 50,
    },
  },
  quotaRiskWindowDays: 30,
  developerShareBps: 5_000,
  premiumMarkupBps: 5_000,
} as const;

export type ImpressionQuotaTier = keyof typeof adPolicy.impressionQuotaTiers;

/**
 * CPM is expressed in kopecks per one thousand impressions.  A single
 * impression can therefore be worth a fraction of a kopeck.  We keep that
 * fraction as an integer remainder instead of rounding every impression and
 * silently losing money.
 */
export const impressionAccounting = {
  chargeRemainderDenominator: 1_000,
  rewardRemainderDenominator: 10_000_000,
} as const;

export type Surface = (typeof surfaces)[number];
export type Role = (typeof roles)[number];
export type CampaignStatus = (typeof campaignStatuses)[number];
export type CampaignFormat = (typeof campaignFormats)[number];
export type CampaignDeliveryMode = (typeof campaignDeliveryModes)[number];

export const surfaceSchema = z.enum(surfaces);
export const roleSchema = z.enum(roles);
export const campaignFormatSchema = z.enum(campaignFormats);
export const campaignDeliveryModeSchema = z.enum(campaignDeliveryModes);

const moneyKopecksSchema = z.number().int().min(1).max(2_000_000_000);
const cpmKopecksSchema = z.number().int().min(2_000).max(1_300_000_000);
const httpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:', 'Ссылка должна использовать HTTPS.');

const campaignCreativeTextSchema = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .refine(
    (value) => value.replace(/^(?:Реклама|Advertisement)\s*:\s*/i, '').trim().length > 0,
    'Добавьте текст объявления, а не только служебную подпись.',
  );

export const campaignCreativeInputSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    text: campaignCreativeTextSchema,
    url: httpsUrlSchema,
    erid: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().min(5).max(80).nullable().optional(),
    ),
  })
  .strict();

export const campaignSurfaceInputSchema = z
  .object({
    surface: surfaceSchema,
    cpmKopecks: cpmKopecksSchema,
  })
  .strict();

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(10).max(72),
    role: roleSchema.default('developer'),
    displayName: z.string().trim().min(1).max(120).optional(),
    companyName: z.string().trim().min(2).max(160).optional(),
    inn: z.string().trim().max(32).optional(),
    captchaToken: z.string().trim().min(1).max(2048),
    termsAccepted: z.literal(true),
    termsVersion: z.literal(legalDocumentVersions.terms),
    privacyAcknowledged: z.literal(true),
    privacyVersion: z.literal(legalDocumentVersions.privacy),
    personalDataConsentAccepted: z.literal(true),
    personalDataConsentVersion: z.literal(legalDocumentVersions.personalDataConsent),
  })
  .strict();

export const updateAdvertiserProfileSchema = z
  .object({
    companyName: z.string().trim().min(2).max(160),
    publicName: z.string().trim().min(2).max(80),
    inn: z.string().trim().min(10).max(12),
    advertiserInfoUrl: httpsUrlSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(72),
  })
  .strict();

export const nextAdQuerySchema = z
  .object({
    surface: surfaceSchema.default('codex_vscode'),
    toolVersion: z.string().trim().min(1).max(80).default('unknown'),
  })
  .strict();

export const impressionEventSchema = z
  .object({
    eventId: z.string().uuid(),
    adId: z.string().uuid(),
    campaignId: z.string().min(1).max(64),
    surface: surfaceSchema,
    visibleMs: z.number().int().min(0).max(300_000),
    clientVersion: z.string().min(1).max(40),
    toolName: z.string().min(1).max(60),
    toolVersion: z.string().min(1).max(40),
  })
  .strict();

export const clickEventSchema = impressionEventSchema
  .omit({ visibleMs: true })
  .extend({
    visibleMs: z.number().int().min(0).max(300_000).optional(),
  })
  .strict();

export type KodpauzaEventType = 'impression' | 'click';
export type SignableKodpauzaEvent = {
  eventId: string;
  adId: string;
  campaignId: string;
  surface: Surface;
  visibleMs?: number;
  clientVersion: string;
  toolName: string;
  toolVersion: string;
};

export function eventSignaturePayload(
  type: KodpauzaEventType,
  event: SignableKodpauzaEvent,
  timestamp: string,
): string {
  return [
    'kodpauza-event-v1',
    type,
    timestamp,
    event.eventId,
    event.adId,
    event.campaignId,
    event.surface,
    event.visibleMs ?? '',
    event.clientVersion,
    event.toolName,
    event.toolVersion,
  ].join('\n');
}

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    text: campaignCreativeTextSchema,
    url: httpsUrlSchema,
    erid: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().min(5).max(80).nullable().optional(),
    ),
    selfPromotion: z.boolean().default(false),
    ordPlatformId: z.string().trim().min(1).max(160).nullable().optional(),
    cpmKopecks: cpmKopecksSchema,
    budgetKopecks: moneyKopecksSchema.min(100),
    impressionsLimit: z.number().int().min(1).max(10_000_000).nullable().optional(),
    format: campaignFormatSchema.default('standard'),
    creatives: z.array(campaignCreativeInputSchema).min(1).max(3).optional(),
    surfaces: z.array(campaignSurfaceInputSchema).min(1).max(surfaces.length).optional(),
    deliveryMode: campaignDeliveryModeSchema.default('asap'),
    dailyBudgetKopecks: moneyKopecksSchema.nullable().optional(),
    frequencyCapPerDay: z.number().int().min(1).max(100).nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .strict();

export const updateCampaignSchema = createCampaignSchema
  .partial()
  .extend({
    status: z.enum(campaignStatuses).optional(),
  })
  .strict();

export const advertiserTopUpSchema = z
  .object({
    amountKopecks: z
      .number()
      .int()
      .min(advertiserTopUpLimits.minimumKopecks)
      .max(advertiserTopUpLimits.maximumKopecks),
    requestId: z.string().uuid(),
  })
  .strict();

export function billableCpmKopecks(
  cpmKopecks: number,
  format: CampaignFormat = 'standard',
): number {
  const markupBps = format === 'premium' ? adPolicy.premiumMarkupBps : 0;
  const result = Math.ceil((cpmKopecks * (10_000 + markupBps)) / 10_000);
  if (!Number.isSafeInteger(result) || result > 2_000_000_000) {
    throw new RangeError('Итоговый CPM превышает допустимый предел.');
  }
  return result;
}

export function rewardForImpression(
  cpmKopecks: number,
  format: CampaignFormat = 'standard',
): number {
  return accrueDeveloperReward(billableCpmKopecks(cpmKopecks, format), 0).amountKopecks;
}

export function impressionCostKopecks(cpmKopecks: number): number {
  return accrueImpressionCharge(cpmKopecks, 0).amountKopecks;
}

export type MoneyAccrual = {
  amountKopecks: number;
  remainderUnits: number;
};

/**
 * Returns the exact integer charge for the next impression and the remainder
 * that must be persisted on the campaign.  Passing the returned remainder to
 * the next call guarantees that N impressions charge exactly
 * floor(N * CPM / 1000) kopecks, even when CPM is not divisible by 1000.
 */
export function accrueImpressionCharge(
  billableCpmKopecks: number,
  remainderMilliKopecks: number,
): MoneyAccrual {
  assertAccountingInput(
    billableCpmKopecks,
    remainderMilliKopecks,
    impressionAccounting.chargeRemainderDenominator,
    'CPM',
  );
  return divideAccrual(
    BigInt(billableCpmKopecks) + BigInt(remainderMilliKopecks),
    impressionAccounting.chargeRemainderDenominator,
  );
}

/**
 * Returns the exact developer reward for the next impression and the
 * remainder that must be persisted on the developer profile.  The reward is
 * calculated from billable CPM before rounding, so a 30 RUB CPM with a 50%
 * share alternates 1/2 kopecks and totals 15 RUB after 1000 impressions.
 */
export function accrueDeveloperReward(
  billableCpmKopecks: number,
  remainderUnits: number,
  developerShareBps: number = adPolicy.developerShareBps,
): MoneyAccrual {
  assertAccountingInput(
    billableCpmKopecks,
    remainderUnits,
    impressionAccounting.rewardRemainderDenominator,
    'CPM',
  );
  if (
    !Number.isSafeInteger(developerShareBps) ||
    developerShareBps < 0 ||
    developerShareBps > 10_000
  ) {
    throw new RangeError('Доля разработчика должна быть целым числом от 0 до 10000 bps.');
  }
  return divideAccrual(
    BigInt(billableCpmKopecks) * BigInt(developerShareBps) + BigInt(remainderUnits),
    impressionAccounting.rewardRemainderDenominator,
  );
}

function assertAccountingInput(
  amount: number,
  remainder: number,
  denominator: number,
  label: string,
) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`${label} должен быть неотрицательным безопасным целым числом.`);
  }
  if (!Number.isSafeInteger(remainder) || remainder < 0 || remainder >= denominator) {
    throw new RangeError(`Остаток должен быть целым числом от 0 до ${denominator - 1}.`);
  }
}

function divideAccrual(numerator: bigint, denominator: number): MoneyAccrual {
  const divisor = BigInt(denominator);
  const amountKopecks = Number(numerator / divisor);
  const remainderUnits = Number(numerator % divisor);
  if (!Number.isSafeInteger(amountKopecks)) {
    throw new RangeError('Начисление превышает допустимый предел.');
  }
  return { amountKopecks, remainderUnits };
}

export const appName = 'kodpauza';

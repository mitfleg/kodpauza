import { z } from 'zod';

export const surfaces = ['claude_code_vscode', 'codex_vscode'] as const;

export const roles = ['developer', 'advertiser', 'admin'] as const;
export const campaignStatuses = ['draft', 'pending', 'active', 'paused', 'rejected'] as const;
export const campaignFormats = ['standard', 'premium'] as const;

export const advertiserTopUpLimits = {
  minimumKopecks: 100,
  maximumKopecks: 1_000_000_000,
} as const;

export const adPolicy = {
  version: '1.0',
  impressionVisibleMs: 5_000,
  minimumSecondsBetweenPaidImpressions: 10,
  hourlyPaidImpressionLimit: 60,
  rollingDayPaidImpressionLimit: 300,
  developerShareBps: 5_000,
  premiumMarkupBps: 5_000,
} as const;

export type Surface = (typeof surfaces)[number];
export type Role = (typeof roles)[number];
export type CampaignStatus = (typeof campaignStatuses)[number];
export type CampaignFormat = (typeof campaignFormats)[number];

export const surfaceSchema = z.enum(surfaces);
export const roleSchema = z.enum(roles);
export const campaignFormatSchema = z.enum(campaignFormats);

const moneyKopecksSchema = z.number().int().min(1).max(2_000_000_000);
const cpmKopecksSchema = z.number().int().min(2_000).max(1_300_000_000);
const httpsUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:', 'Ссылка должна использовать HTTPS.');

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(10).max(72),
    role: roleSchema.default('developer'),
    displayName: z.string().trim().min(1).max(120).optional(),
    companyName: z.string().trim().min(2).max(160).optional(),
    inn: z.string().trim().max(32).optional(),
    captchaToken: z.string().trim().min(1).max(2048),
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
    name: z.string().trim().min(2).max(120),
    text: z.string().trim().min(8).max(120),
    url: httpsUrlSchema,
    erid: z.string().trim().max(80).nullable().optional(),
    cpmKopecks: cpmKopecksSchema,
    budgetKopecks: moneyKopecksSchema.min(100),
    impressionsLimit: z.number().int().min(1).max(10_000_000).nullable().optional(),
    format: campaignFormatSchema.default('standard'),
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
  const costKopecks = impressionCostKopecks(billableCpmKopecks(cpmKopecks, format));
  return Math.floor((costKopecks * adPolicy.developerShareBps) / 10_000);
}

export function impressionCostKopecks(cpmKopecks: number): number {
  return Math.floor(cpmKopecks / 1000);
}

export const appName = 'kodpauza';

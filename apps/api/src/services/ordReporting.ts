import type { OrdStatisticReport } from '@prisma/client';
import { prisma } from '../prisma.js';
import type { YandexOrdClientContract } from './yandexOrd.js';

export function reportMonthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error('Месяц должен быть указан в формате YYYY-MM.');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, end };
}

type ReportCreative = {
  id: string;
  ordCreativeId: string | null;
  campaign: { ordPlatformId: string | null };
};

export type OrdReportCreativeGroup = {
  creativeId: string;
  ordCreativeId: string;
  platformId: string;
  creativeIds: string[];
};

export function groupOrdReportCreatives(
  creatives: ReportCreative[],
): OrdReportCreativeGroup[] {
  const groups = new Map<string, OrdReportCreativeGroup>();
  for (const creative of creatives) {
    const ordCreativeId = creative.ordCreativeId;
    const platformId = creative.campaign.ordPlatformId;
    if (!ordCreativeId || !platformId) continue;
    const key = `${platformId}\0${ordCreativeId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.creativeIds.push(creative.id);
      continue;
    }
    groups.set(key, {
      creativeId: creative.id,
      ordCreativeId,
      platformId,
      creativeIds: [creative.id],
    });
  }
  return [...groups.values()];
}

export async function prepareMonthlyOrdReports(month: string): Promise<OrdStatisticReport[]> {
  const { start, end } = reportMonthRange(month);
  const creatives = await prisma.campaignCreative.findMany({
    where: {
      erid: { not: null },
      ordCreativeId: { not: null },
      createdAt: { lt: end },
      campaign: {
        is: {
          selfPromotion: true,
          ordPlatformId: { not: null },
        },
      },
    },
    include: { campaign: { select: { ordPlatformId: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const reports: OrdStatisticReport[] = [];
  for (const group of groupOrdReportCreatives(creatives)) {
    const [impressions, clicks] = await Promise.all([
      prisma.adServe.count({
        where: {
          creativeId: { in: group.creativeIds },
          impressionRecordedAt: { gte: start, lt: end },
        },
      }),
      prisma.adServe.count({
        where: {
          creativeId: { in: group.creativeIds },
          clickRecordedAt: { gte: start, lt: end },
        },
      }),
    ]);
    reports.push(
      await prisma.ordStatisticReport.upsert({
        where: {
          creativeId_platformId_periodStart_periodEnd: {
            creativeId: group.creativeId,
            platformId: group.platformId,
            periodStart: start,
            periodEnd: end,
          },
        },
        create: {
          creativeId: group.creativeId,
          platformId: group.platformId,
          periodStart: start,
          periodEnd: end,
          impressions,
          clicks,
          amountKopecks: 0,
        },
        update: {
          ...((await isMutableReport(group.creativeId, group.platformId, start, end))
            ? { impressions, clicks, amountKopecks: 0 }
            : {}),
        },
      }),
    );
  }
  return reports;
}

export async function submitOrdReport(
  reportId: string,
  client: YandexOrdClientContract,
): Promise<OrdStatisticReport> {
  if (!client.isConfigured()) throw new Error('Интеграция Яндекс ОРД не настроена.');
  const report = await prisma.ordStatisticReport.findUnique({
    where: { id: reportId },
    include: { creative: { select: { ordCreativeId: true } } },
  });
  if (!report) throw new Error('Отчёт ОРД не найден.');
  if (!report.creative.ordCreativeId) throw new Error('Креатив не привязан к объекту ОРД.');
  if (report.status === 'accepted') return report;
  const claimed = await prisma.ordStatisticReport.updateMany({
    where: { id: report.id, status: { in: ['draft', 'rejected'] } },
    data: { status: 'submitted', submittedAt: new Date(), error: null },
  });
  if (claimed.count === 0) {
    return prisma.ordStatisticReport.findUniqueOrThrow({ where: { id: report.id } });
  }
  try {
    const result = await client.submitSelfPromotionStatistic({
      creativeId: report.creative.ordCreativeId,
      platformId: report.platformId,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      impressions: report.impressions,
    });
    return prisma.ordStatisticReport.update({
      where: { id: report.id },
      data: {
        externalRequestId: result.requestId,
        ...(isAcceptedStatus(result.status)
          ? { status: 'accepted', acceptedAt: new Date() }
          : { status: 'submitted' }),
      },
    });
  } catch (error) {
    await prisma.ordStatisticReport.update({
      where: { id: report.id },
      data: {
        status: 'rejected',
        error: error instanceof Error ? error.message.slice(0, 1000) : 'Ошибка отправки в ОРД.',
      },
    });
    throw error;
  }
}

export async function refreshOrdReport(
  reportId: string,
  client: YandexOrdClientContract,
): Promise<OrdStatisticReport> {
  const report = await prisma.ordStatisticReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('Отчёт ОРД не найден.');
  if (report.status === 'accepted' || !report.externalRequestId) return report;
  const result = await client.getRequestStatus(report.externalRequestId);
  const rejected = isRejectedStatus(result.status);
  return prisma.ordStatisticReport.update({
    where: { id: report.id },
    data: {
      ...(isAcceptedStatus(result.status)
        ? { status: 'accepted', acceptedAt: new Date(), error: null }
        : rejected
          ? { status: 'rejected', error: result.status }
          : { status: 'submitted' }),
    },
  });
}

export function previousUtcMonth(now = new Date()): string {
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return previous.toISOString().slice(0, 7);
}

export async function runAutomaticOrdReporting(
  client: YandexOrdClientContract,
  now = new Date(),
): Promise<void> {
  if (!client.isConfigured()) return;
  const submitted = await prisma.ordStatisticReport.findMany({
    where: { status: 'submitted', externalRequestId: { not: null } },
    select: { id: true },
    take: 100,
  });
  for (const report of submitted) {
    await refreshOrdReport(report.id, client).catch(() => undefined);
  }
  const reports = await prepareMonthlyOrdReports(previousUtcMonth(now));
  for (const report of reports.filter((item) => ['draft', 'rejected'].includes(item.status))) {
    await submitOrdReport(report.id, client).catch(() => undefined);
  }
}

async function isMutableReport(
  creativeId: string,
  platformId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<boolean> {
  const current = await prisma.ordStatisticReport.findUnique({
    where: {
      creativeId_platformId_periodStart_periodEnd: {
        creativeId,
        platformId,
        periodStart,
        periodEnd,
      },
    },
    select: { status: true },
  });
  return !current || current.status === 'draft' || current.status === 'rejected';
}

function isAcceptedStatus(status: string): boolean {
  return status === 'ERIR sync success' || status === 'ERIR async success';
}

function isRejectedStatus(status: string): boolean {
  return (
    status === 'ORD error' ||
    status === 'ERIR sync error' ||
    status === 'ERIR async error' ||
    status === 'ORD rejected'
  );
}

import { config } from '../config.js';

export type OrdStatisticInput = {
  creativeId: string;
  platformId: string;
  periodStart: Date;
  periodEnd: Date;
  impressions: number;
};

export type OrdSubmission = {
  requestId: string;
  status: string;
};

export interface YandexOrdClientContract {
  isConfigured(): boolean;
  submitSelfPromotionStatistic(input: OrdStatisticInput): Promise<OrdSubmission>;
  getRequestStatus(requestId: string): Promise<OrdSubmission>;
}

export class YandexOrdClient implements YandexOrdClientContract {
  isConfigured(): boolean {
    return Boolean(config.yandexOrdApiToken);
  }

  async submitSelfPromotionStatistic(input: OrdStatisticInput): Promise<OrdSubmission> {
    if (!this.isConfigured()) {
      throw new Error('Интеграция Яндекс ОРД не настроена.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.yandexOrdTimeoutMs);
    timeout.unref();
    try {
      const response = await fetch(new URL('/api/v8/statistics', config.yandexOrdApiBaseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.yandexOrdApiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          statistics: [
            {
              creativeId: input.creativeId,
              platformId: input.platformId,
              impsFact: input.impressions,
              impsPlan: input.impressions,
              dateStartFact: dateOnly(input.periodStart),
              dateEndFact: dateOnly(inclusivePeriodEnd(input.periodEnd)),
              dateStartPlan: dateOnly(input.periodStart),
              dateEndPlan: dateOnly(inclusivePeriodEnd(input.periodEnd)),
              amountPerUnit: '0',
              type: 'cpm',
              amount: {
                excludingVat: '0',
                vatRate: '100',
                vat: '0',
                includingVat: '0',
              },
            },
          ],
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (
        !response.ok ||
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as Record<string, unknown>).request_id !== 'string'
      ) {
        throw new Error(`Яндекс ОРД отклонил статистику: HTTP ${response.status}.`);
      }
      const result = payload as Record<string, unknown>;
      return {
        requestId: result.request_id as string,
        status: typeof result.status === 'string' ? result.status : 'Request accepted by ORD',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async getRequestStatus(requestId: string): Promise<OrdSubmission> {
    if (!this.isConfigured()) {
      throw new Error('Интеграция Яндекс ОРД не настроена.');
    }
    const url = new URL('/api/v8/status', config.yandexOrdApiBaseUrl);
    url.searchParams.set('reqid', requestId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.yandexOrdTimeoutMs);
    timeout.unref();
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${config.yandexOrdApiToken}` },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (
        !response.ok ||
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as Record<string, unknown>).request_id !== 'string'
      ) {
        throw new Error(`Не удалось получить статус Яндекс ОРД: HTTP ${response.status}.`);
      }
      const result = payload as Record<string, unknown>;
      return {
        requestId: result.request_id as string,
        status: typeof result.status === 'string' ? result.status : 'ORD error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function inclusivePeriodEnd(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() - 1);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

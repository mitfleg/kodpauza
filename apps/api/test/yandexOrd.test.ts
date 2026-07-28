import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { YandexOrdClient } from '../src/services/yandexOrd.js';

const originalToken = config.yandexOrdApiToken;
const originalBaseUrl = config.yandexOrdApiBaseUrl;

afterEach(() => {
  config.yandexOrdApiToken = originalToken;
  config.yandexOrdApiBaseUrl = originalBaseUrl;
  vi.unstubAllGlobals();
});

describe('YandexOrdClient', () => {
  it('отправляет нулевую статистику собственной рекламы по Bearer OAuth', async () => {
    config.yandexOrdApiToken = 'secret-oauth-token';
    config.yandexOrdApiBaseUrl = 'https://ord.test';
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          request_id: 'request-1',
          status: 'Request accepted by ORD',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new YandexOrdClient().submitSelfPromotionStatistic({
      creativeId: 'creative-1',
      platformId: 'platform-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
      impressions: 42,
    });

    expect(result).toEqual({ requestId: 'request-1', status: 'Request accepted by ORD' });
    expect(calls[0]?.url).toBe('https://ord.test/api/v8/statistics');
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: 'Bearer secret-oauth-token',
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      statistics: [
        {
          creativeId: 'creative-1',
          platformId: 'platform-1',
          impsFact: 42,
          impsPlan: 42,
          dateStartFact: '2026-06-01',
          dateEndFact: '2026-06-30',
          dateStartPlan: '2026-06-01',
          dateEndPlan: '2026-06-30',
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
    });
  });
});

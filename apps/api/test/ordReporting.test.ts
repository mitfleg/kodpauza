import { describe, expect, it } from 'vitest';
import {
  groupOrdReportCreatives,
  previousUtcMonth,
  reportMonthRange,
} from '../src/services/ordReporting.js';

describe('периоды ежемесячной отчётности ОРД', () => {
  it('строит полуоткрытый UTC-интервал календарного месяца', () => {
    expect(reportMonthRange('2026-07')).toEqual({
      start: new Date('2026-07-01T00:00:00.000Z'),
      end: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('корректно переходит через границу года', () => {
    expect(previousUtcMonth(new Date('2026-01-12T10:00:00.000Z'))).toBe('2025-12');
  });

  it('отклоняет неполный или невозможный месяц', () => {
    expect(() => reportMonthRange('2026-7')).toThrow(/YYYY-MM/);
    expect(() => reportMonthRange('2026-13')).toThrow(/YYYY-MM/);
  });
});

describe('группировка креативов для отчётности ОРД', () => {
  it('суммирует внутренние варианты, привязанные к одному объекту ОРД', () => {
    expect(
      groupOrdReportCreatives([
        {
          id: 'variant-1',
          ordCreativeId: 'ord-creative',
          campaign: { ordPlatformId: 'platform' },
        },
        {
          id: 'variant-2',
          ordCreativeId: 'ord-creative',
          campaign: { ordPlatformId: 'platform' },
        },
      ]),
    ).toEqual([
      {
        creativeId: 'variant-1',
        ordCreativeId: 'ord-creative',
        platformId: 'platform',
        creativeIds: ['variant-1', 'variant-2'],
      },
    ]);
  });

  it('не объединяет разные объекты ОРД или площадки', () => {
    expect(
      groupOrdReportCreatives([
        {
          id: 'creative-1',
          ordCreativeId: 'ord-1',
          campaign: { ordPlatformId: 'platform-1' },
        },
        {
          id: 'creative-2',
          ordCreativeId: 'ord-2',
          campaign: { ordPlatformId: 'platform-1' },
        },
        {
          id: 'creative-3',
          ordCreativeId: 'ord-1',
          campaign: { ordPlatformId: 'platform-2' },
        },
      ]),
    ).toHaveLength(3);
  });
});

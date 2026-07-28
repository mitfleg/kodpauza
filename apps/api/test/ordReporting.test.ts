import { describe, expect, it } from 'vitest';
import { previousUtcMonth, reportMonthRange } from '../src/services/ordReporting.js';

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

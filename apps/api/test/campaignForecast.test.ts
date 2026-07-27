import { describe, expect, it } from 'vitest';
import { forecastQuerySchema } from '../src/routes/analytics.js';
import { campaignForecast } from '../src/services/campaignForecast.js';

const daily = (impressions: number) => Array.from({ length: 28 }, () => impressions);

describe('campaign forecast', () => {
  it('uses CPM-weighted competition and estimates completion by the deadline', () => {
    const forecast = campaignForecast({
      budgetKopecks: 500_000,
      impressionsLimit: 10_000,
      now: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-02-20T00:00:00.000Z'),
      placements: [
        {
          surface: 'codex_vscode',
          cpmKopecks: 30_000,
          billableCpmKopecks: 30_000,
          competitorBillableCpms: [30_000, 30_000, 30_000, 30_000],
          dailyNetworkImpressions: daily(1_000),
        },
      ],
    });

    expect(forecast).toMatchObject({
      estimatedImpressions: 10_000,
      estimatedDays: 50,
      estimatedDailyImpressions: 200,
      requiredDailyImpressions: 200,
      completionProbability: 100,
      warningCode: null,
    });
    expect(forecast.placements[0]).toMatchObject({
      recommendedCpmMinKopecks: 30_000,
      recommendedCpmMaxKopecks: 30_000,
      expectedDailyImpressions: 200,
      warningCode: null,
    });
  });

  it('recommends a market range and warns about a weak bid', () => {
    const forecast = campaignForecast({
      budgetKopecks: 100_000,
      placements: [
        {
          surface: 'claude_code_vscode',
          cpmKopecks: 20_000,
          billableCpmKopecks: 20_000,
          competitorBillableCpms: [30_000, 30_000, 40_000, 50_000],
          dailyNetworkImpressions: daily(1_000),
        },
      ],
    });

    expect(forecast.warningCode).toBe('below_competitive');
    expect(forecast.placements[0]).toMatchObject({
      recommendedCpmMinKopecks: 30_000,
      recommendedCpmMaxKopecks: 40_000,
      expectedDailyImpressions: 118,
      warningCode: 'below_competitive',
    });
  });

  it('detects when a bid falls outside the top 100 auction candidates', () => {
    const forecast = campaignForecast({
      budgetKopecks: 100_000,
      placements: [
        {
          surface: 'codex_vscode',
          cpmKopecks: 20_000,
          billableCpmKopecks: 20_000,
          competitorBillableCpms: Array.from({ length: 100 }, () => 30_000),
          dailyNetworkImpressions: daily(1_000),
        },
      ],
    });

    expect(forecast.estimatedDailyImpressions).toBe(0);
    expect(forecast.warningCode).toBe('top_100_risk');
    expect(forecast.placements[0]).toMatchObject({
      expectedDailyImpressions: 0,
      warningCode: 'top_100_risk',
    });
  });

  it('applies the daily budget to the delivery estimate', () => {
    const forecast = campaignForecast({
      budgetKopecks: 300_000,
      dailyBudgetKopecks: 15_000,
      placements: [
        {
          surface: 'codex_vscode',
          cpmKopecks: 30_000,
          billableCpmKopecks: 30_000,
          competitorBillableCpms: [],
          dailyNetworkImpressions: daily(1_000),
        },
      ],
    });

    expect(forecast.estimatedDailyImpressions).toBe(500);
    expect(forecast.estimatedDays).toBe(20);
    expect(forecast.dailyImpressionRange).toEqual({ p10: 500, p50: 500, p90: 500 });
  });

  it('does not invent probability or delivery speed without traffic history', () => {
    const forecast = campaignForecast({
      budgetKopecks: 100_000,
      now: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-01-31T00:00:00.000Z'),
      placements: [
        {
          surface: 'codex_vscode',
          cpmKopecks: 20_000,
          billableCpmKopecks: 20_000,
          competitorBillableCpms: [],
          dailyNetworkImpressions: daily(0),
        },
      ],
    });

    expect(forecast.estimatedDays).toBeNull();
    expect(forecast.completionProbability).toBeNull();
    expect(forecast.warningCode).toBe('insufficient_history');
  });

  it('converts a premium market recommendation back to the advertiser base CPM', () => {
    const forecast = campaignForecast({
      budgetKopecks: 100_000,
      premiumMarkupBps: 5_000,
      placements: [
        {
          surface: 'codex_vscode',
          cpmKopecks: 20_000,
          billableCpmKopecks: 30_000,
          competitorBillableCpms: [45_000],
          dailyNetworkImpressions: daily(1_000),
        },
      ],
    });

    expect(forecast.placements[0]).toMatchObject({
      recommendedCpmMinKopecks: 30_000,
      recommendedCpmMaxKopecks: 35_000,
      warningCode: 'below_competitive',
    });
  });
});

describe('forecast query', () => {
  it('parses per-surface CPM values, budgets and dates', () => {
    const parsed = forecastQuerySchema.parse({
      budgetKopecks: '100000',
      cpmKopecks: '25000',
      format: 'standard',
      surfaces: 'codex_vscode,claude_code_vscode',
      surfaceCpms: 'codex_vscode:30000,claude_code_vscode:25000',
      dailyBudgetKopecks: '20000',
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-08-10T00:00:00.000Z',
    });

    expect(parsed.surfaceCpms).toEqual([
      { surface: 'codex_vscode', cpmKopecks: 30_000 },
      { surface: 'claude_code_vscode', cpmKopecks: 25_000 },
    ]);
    expect(parsed.dailyBudgetKopecks).toBe(20_000);
    expect(parsed.endsAt).toEqual(new Date('2026-08-10T00:00:00.000Z'));
  });

  it('rejects duplicate or incomplete surface CPM values', () => {
    expect(
      forecastQuerySchema.safeParse({
        budgetKopecks: '100000',
        cpmKopecks: '20000',
        format: 'standard',
        surfaces: 'codex_vscode,claude_code_vscode',
        surfaceCpms: 'codex_vscode:20000,codex_vscode:30000',
      }).success,
    ).toBe(false);
    expect(
      forecastQuerySchema.safeParse({
        budgetKopecks: '100000',
        cpmKopecks: '20000',
        format: 'standard',
        surfaces: 'unknown',
      }).success,
    ).toBe(false);
  });
});

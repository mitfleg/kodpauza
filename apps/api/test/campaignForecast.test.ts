import { describe, expect, it } from 'vitest';
import { campaignForecast } from '../src/services/campaignForecast.js';
import { forecastQuerySchema } from '../src/routes/analytics.js';

describe('campaign forecast', () => {
  it('uses budget, impression limit and factual network history', () => {
    expect(
      campaignForecast({
        budgetKopecks: 500_000,
        billableCpmKopecks: 30_000,
        impressionsLimit: 10_000,
        recentImpressions: 7_000,
        sampleDays: 7,
        activeCampaigns: 4,
      }),
    ).toEqual({
      estimatedImpressions: 10_000,
      estimatedDays: 50,
      recentDailyNetworkImpressions: 1_000,
      activeCampaigns: 4,
    });
  });

  it('does not invent a delivery period without traffic history', () => {
    expect(
      campaignForecast({
        budgetKopecks: 100_000,
        billableCpmKopecks: 20_000,
        recentImpressions: 0,
        sampleDays: 7,
        activeCampaigns: 0,
      }).estimatedDays,
    ).toBeNull();
  });

  it('scopes inventory history to the selected delivery surfaces', () => {
    expect(
      forecastQuerySchema.parse({
        budgetKopecks: '100000',
        cpmKopecks: '20000',
        format: 'standard',
        surfaces: 'codex_vscode',
      }).surfaces,
    ).toEqual(['codex_vscode']);
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

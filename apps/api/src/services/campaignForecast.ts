export type CampaignForecastInput = {
  budgetKopecks: number;
  billableCpmKopecks: number;
  impressionsLimit?: number;
  recentImpressions: number;
  sampleDays: number;
  activeCampaigns: number;
};

export function campaignForecast(input: CampaignForecastInput) {
  const budgetImpressions = Math.floor(
    (input.budgetKopecks * 1_000) / input.billableCpmKopecks,
  );
  const estimatedImpressions = input.impressionsLimit
    ? Math.min(budgetImpressions, input.impressionsLimit)
    : budgetImpressions;
  const recentDailyNetworkImpressions =
    input.sampleDays > 0 ? input.recentImpressions / input.sampleDays : 0;
  const estimatedDailyImpressions =
    recentDailyNetworkImpressions > 0
      ? recentDailyNetworkImpressions / Math.max(1, input.activeCampaigns + 1)
      : 0;
  const estimatedDays =
    estimatedDailyImpressions > 0
      ? Math.max(1, Math.ceil(estimatedImpressions / estimatedDailyImpressions))
      : null;

  return {
    estimatedImpressions,
    estimatedDays,
    recentDailyNetworkImpressions: Math.round(recentDailyNetworkImpressions * 10) / 10,
    activeCampaigns: input.activeCampaigns,
  };
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const MIN_CPM_KOPECKS = 2_000;
const MAX_AUCTION_CANDIDATES = 100;
const COOLDOWN_WINDOWS = 2;
const BOOTSTRAP_SCENARIOS = 256;
const RECOMMENDATION_QUANTUM_KOPECKS = 5_000;

export type CampaignForecastWarning =
  | 'below_competitive'
  | 'top_100_risk'
  | 'insufficient_inventory'
  | 'insufficient_history';

export type PlacementForecastInput = {
  surface: string;
  cpmKopecks: number;
  billableCpmKopecks: number;
  competitorBillableCpms: number[];
  dailyNetworkImpressions: number[];
};

export type CampaignForecastInput = {
  budgetKopecks: number;
  impressionsLimit?: number;
  dailyBudgetKopecks?: number;
  startsAt?: Date;
  endsAt?: Date;
  now?: Date;
  premiumMarkupBps?: number;
  placements: PlacementForecastInput[];
};

export type PlacementForecast = {
  surface: string;
  cpmKopecks: number;
  billableCpmKopecks: number;
  recommendedCpmMinKopecks: number | null;
  recommendedCpmMaxKopecks: number | null;
  expectedDailyImpressions: number;
  activeCampaigns: number;
  warningCode: Extract<
    CampaignForecastWarning,
    'below_competitive' | 'top_100_risk' | 'insufficient_history'
  > | null;
};

export function campaignForecast(input: CampaignForecastInput) {
  const now = input.now ?? new Date();
  const placementStates = input.placements.map((placement) =>
    placementForecast(placement, input.premiumMarkupBps ?? 0),
  );
  const historyLength = Math.max(
    0,
    ...input.placements.map((placement) => placement.dailyNetworkImpressions.length),
  );
  const projectedDays = Array.from({ length: historyLength }, (_, dayIndex) =>
    projectedDay(input, placementStates, dayIndex),
  );
  const dailyImpressions = projectedDays.map((day) => day.impressions);
  const dailySpendKopecks = projectedDays.map((day) => day.spendKopecks);
  const estimatedDailyImpressions = round(mean(dailyImpressions));
  const estimatedDailySpendKopecks = mean(dailySpendKopecks);
  const blendedBillableCpmKopecks =
    estimatedDailyImpressions > 0
      ? Math.max(
          MIN_CPM_KOPECKS,
          Math.round((estimatedDailySpendKopecks * 1_000) / estimatedDailyImpressions),
        )
      : weightedAverageBillableCpm(input.placements);
  const budgetImpressions =
    blendedBillableCpmKopecks > 0
      ? Math.floor((input.budgetKopecks * 1_000) / blendedBillableCpmKopecks)
      : 0;
  const estimatedImpressions = input.impressionsLimit
    ? Math.min(budgetImpressions, input.impressionsLimit)
    : budgetImpressions;
  const estimatedDays =
    estimatedDailyImpressions > 0
      ? Math.max(1, Math.ceil(estimatedImpressions / estimatedDailyImpressions))
      : null;
  const availableDays = campaignAvailableDays(now, input.startsAt, input.endsAt);
  const hasTrafficHistory = input.placements.some((placement) =>
    placement.dailyNetworkImpressions.some((value) => value > 0),
  );
  const completionProbability =
    availableDays === null || !hasTrafficHistory || estimatedImpressions <= 0
      ? null
      : bootstrapCompletionProbability(
          dailyImpressions,
          availableDays,
          estimatedImpressions,
        );
  const requiredDailyImpressions =
    availableDays && availableDays > 0
      ? Math.ceil(estimatedImpressions / availableDays)
      : null;
  const dailyImpressionRange = {
    p10: round(percentile(dailyImpressions, 0.1) ?? 0),
    p50: round(percentile(dailyImpressions, 0.5) ?? 0),
    p90: round(percentile(dailyImpressions, 0.9) ?? 0),
  };
  const placementWarnings = placementStates
    .map((placement) => placement.forecast.warningCode)
    .filter((warning): warning is NonNullable<typeof warning> => warning !== null);
  const warningCode: CampaignForecastWarning | null =
    placementWarnings.includes('top_100_risk')
      ? 'top_100_risk'
      : placementWarnings.includes('insufficient_history')
        ? 'insufficient_history'
        : placementWarnings.includes('below_competitive')
          ? 'below_competitive'
          : completionProbability !== null && completionProbability < 50
            ? 'insufficient_inventory'
            : null;

  return {
    estimatedImpressions,
    estimatedDays,
    estimatedDailyImpressions,
    requiredDailyImpressions,
    completionProbability,
    dailyImpressionRange,
    recentDailyNetworkImpressions: round(
      input.placements.reduce(
        (total, placement) => total + mean(placement.dailyNetworkImpressions),
        0,
      ),
      1,
    ),
    activeCampaigns: input.placements.reduce(
      (total, placement) => total + placement.competitorBillableCpms.length,
      0,
    ),
    blendedBillableCpmKopecks,
    placements: placementStates.map((placement) => placement.forecast),
    warningCode,
  };
}

function placementForecast(
  input: PlacementForecastInput,
  premiumMarkupBps: number,
): {
  share: number;
  forecast: PlacementForecast;
} {
  const competitorCpms = input.competitorBillableCpms
    .filter((value) => Number.isSafeInteger(value) && value >= MIN_CPM_KOPECKS)
    .sort((left, right) => right - left);
  const bidRank =
    1 + competitorCpms.filter((value) => value >= input.billableCpmKopecks).length;
  const hasHistory = input.dailyNetworkImpressions.some((value) => value > 0);
  const [recommendedBillableMin, recommendedBillableMax] =
    recommendedBillableRange(competitorCpms);
  const recommendedCpmMinKopecks = baseCpmForBillable(
    recommendedBillableMin,
    premiumMarkupBps,
  );
  const recommendedCpmMaxKopecks = baseCpmForBillable(
    Math.max(recommendedBillableMin, recommendedBillableMax),
    premiumMarkupBps,
  );
  const share = projectedAuctionShare(
    input.billableCpmKopecks,
    competitorCpms,
  );
  const warningCode =
    bidRank > MAX_AUCTION_CANDIDATES
      ? 'top_100_risk'
      : !hasHistory
        ? 'insufficient_history'
        : input.billableCpmKopecks < recommendedBillableMin
          ? 'below_competitive'
          : null;

  return {
    share,
    forecast: {
      surface: input.surface,
      cpmKopecks: input.cpmKopecks,
      billableCpmKopecks: input.billableCpmKopecks,
      recommendedCpmMinKopecks,
      recommendedCpmMaxKopecks,
      expectedDailyImpressions: round(mean(input.dailyNetworkImpressions) * share),
      activeCampaigns: competitorCpms.length,
      warningCode,
    },
  };
}

function recommendedBillableRange(competitorCpms: number[]): [number, number] {
  if (competitorCpms.length === 0) {
    return [MIN_CPM_KOPECKS, MIN_CPM_KOPECKS];
  }
  // Never expose a lone advertiser's exact CPM. Sparse markets are widened and
  // every public recommendation is rounded to a coarse 50-ruble band.
  if (competitorCpms.length < 3) {
    const center = mean(competitorCpms);
    return [
      roundDownCpm(center * 0.9),
      Math.max(roundDownCpm(center * 0.9), roundUpCpm(center * 1.1)),
    ];
  }
  const lower = percentile(competitorCpms, 0.5) ?? MIN_CPM_KOPECKS;
  const upper = percentile(competitorCpms, 0.75) ?? lower;
  return [roundDownCpm(lower), Math.max(roundDownCpm(lower), roundUpCpm(upper))];
}

function roundDownCpm(value: number): number {
  return Math.max(
    MIN_CPM_KOPECKS,
    Math.floor(value / RECOMMENDATION_QUANTUM_KOPECKS) *
      RECOMMENDATION_QUANTUM_KOPECKS,
  );
}

function roundUpCpm(value: number): number {
  return Math.max(
    MIN_CPM_KOPECKS,
    Math.ceil(value / RECOMMENDATION_QUANTUM_KOPECKS) *
      RECOMMENDATION_QUANTUM_KOPECKS,
  );
}

function projectedDay(
  input: CampaignForecastInput,
  placementStates: Array<{ share: number }>,
  dayIndex: number,
): { impressions: number; spendKopecks: number } {
  let impressions = 0;
  let spendKopecks = 0;

  for (const [placementIndex, placement] of input.placements.entries()) {
    const history = placement.dailyNetworkImpressions;
    const networkImpressions = history.length
      ? Math.max(0, history[dayIndex % history.length] ?? 0)
      : 0;
    const placementImpressions = networkImpressions * (placementStates[placementIndex]?.share ?? 0);
    impressions += placementImpressions;
    spendKopecks += (placementImpressions * placement.billableCpmKopecks) / 1_000;
  }

  if (
    input.dailyBudgetKopecks &&
    spendKopecks > input.dailyBudgetKopecks &&
    spendKopecks > 0
  ) {
    const scale = input.dailyBudgetKopecks / spendKopecks;
    return {
      impressions: impressions * scale,
      spendKopecks: input.dailyBudgetKopecks,
    };
  }

  return { impressions, spendKopecks };
}

function projectedAuctionShare(
  billableCpmKopecks: number,
  competitorBillableCpms: number[],
): number {
  // Mirrors the production selector's top-100 pool, CPM weight and two-window
  // cooldown. The long-run cooldown cap prevents a large bid from being shown
  // in consecutive wait windows.
  const candidate = { own: true, cpm: billableCpmKopecks };
  const auction = [
    ...competitorBillableCpms.map((cpm) => ({ own: false, cpm })),
    candidate,
  ]
    .sort((left, right) => {
      if (left.cpm !== right.cpm) return right.cpm - left.cpm;
      return Number(left.own) - Number(right.own);
    })
    .slice(0, MAX_AUCTION_CANDIDATES);
  if (!auction.includes(candidate)) return 0;

  const totalWeight = auction.reduce((total, item) => total + item.cpm, 0);
  if (totalWeight <= 0) return 0;
  const rawShare = billableCpmKopecks / totalWeight;
  const cooldownSize = Math.min(COOLDOWN_WINDOWS, auction.length - 1);
  const cooldownShareCap = 1 / (cooldownSize + 1);
  return Math.min(rawShare, cooldownShareCap);
}

function bootstrapCompletionProbability(
  projectedDailyImpressions: number[],
  availableDays: number,
  targetImpressions: number,
): number {
  if (projectedDailyImpressions.length === 0 || availableDays <= 0) return 0;
  let completed = 0;

  for (let scenario = 0; scenario < BOOTSTRAP_SCENARIOS; scenario += 1) {
    // A deterministic bootstrap keeps API responses and tests stable while
    // sampling the actual day-to-day traffic spread from the last 28 days.
    let seed = (scenario + 1) * 0x9e3779b1;
    let delivered = 0;
    for (let day = 0; day < availableDays && delivered < targetImpressions; day += 1) {
      seed = xorshift32(seed);
      const index = Math.abs(seed) % projectedDailyImpressions.length;
      delivered += projectedDailyImpressions[index] ?? 0;
    }
    if (delivered >= targetImpressions) completed += 1;
  }

  return Math.round((completed / BOOTSTRAP_SCENARIOS) * 100);
}

function campaignAvailableDays(
  now: Date,
  startsAt?: Date,
  endsAt?: Date,
): number | null {
  if (!endsAt) return null;
  const startMs = Math.max(now.getTime(), startsAt?.getTime() ?? now.getTime());
  return Math.max(0, Math.ceil((endsAt.getTime() - startMs) / DAY_MS));
}

function baseCpmForBillable(billableCpmKopecks: number, premiumMarkupBps: number): number {
  if (billableCpmKopecks <= MIN_CPM_KOPECKS) return MIN_CPM_KOPECKS;
  const denominator = 10_000 + Math.max(0, premiumMarkupBps);
  const base = Math.ceil((billableCpmKopecks * 10_000) / denominator);
  return Math.max(
    MIN_CPM_KOPECKS,
    Math.ceil(base / RECOMMENDATION_QUANTUM_KOPECKS) *
      RECOMMENDATION_QUANTUM_KOPECKS,
  );
}

function weightedAverageBillableCpm(placements: PlacementForecastInput[]): number {
  if (placements.length === 0) return 0;
  const total = placements.reduce(
    (sum, placement) => sum + placement.billableCpmKopecks,
    0,
  );
  return Math.round(total / placements.length);
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.min(index, sorted.length - 1)] ?? null;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function xorshift32(value: number): number {
  let next = value | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next | 0;
}

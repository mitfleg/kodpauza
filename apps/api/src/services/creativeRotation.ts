const EXPLORATION_IMPRESSIONS_PER_CREATIVE = 20;

type CreativeCandidate = {
  id: string;
  enabled: boolean;
  impressionsServed: number;
  clicks: number;
  createdAt: Date;
};

export function selectCampaignCreative<T extends CreativeCandidate>(
  creatives: readonly T[],
  recentServes: readonly { creativeId: string }[],
): T | undefined {
  const enabled = creatives.filter((creative) => creative.enabled);
  if (enabled.length === 0) return undefined;

  const lastCreativeId = recentServes[0]?.creativeId;
  const withoutImmediateRepeat =
    enabled.length > 1 ? enabled.filter((creative) => creative.id !== lastCreativeId) : enabled;
  const exploring = withoutImmediateRepeat.filter(
    (creative) => creative.impressionsServed < EXPLORATION_IMPRESSIONS_PER_CREATIVE,
  );
  if (exploring.length > 0) {
    return [...exploring].sort(compareExploration)[0];
  }

  const recentCounts = new Map<string, number>();
  for (const serve of recentServes) {
    recentCounts.set(serve.creativeId, (recentCounts.get(serve.creativeId) ?? 0) + 1);
  }
  return withoutImmediateRepeat.reduce<T | undefined>((selected, creative) => {
    if (!selected) return creative;
    return comparePerformance(creative, selected, recentCounts) < 0 ? creative : selected;
  }, undefined);
}

function compareExploration(left: CreativeCandidate, right: CreativeCandidate): number {
  if (left.impressionsServed !== right.impressionsServed) {
    return left.impressionsServed - right.impressionsServed;
  }
  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt.getTime() - right.createdAt.getTime();
  }
  return left.id.localeCompare(right.id);
}

function comparePerformance(
  left: CreativeCandidate,
  right: CreativeCandidate,
  recentCounts: ReadonlyMap<string, number>,
): number {
  // Beta(1, 19) smoothing prevents a single early click from monopolising traffic.
  const leftNumerator = BigInt(left.clicks + 1);
  const leftDenominator = BigInt(left.impressionsServed + 20);
  const rightNumerator = BigInt(right.clicks + 1);
  const rightDenominator = BigInt(right.impressionsServed + 20);
  const leftRecent = BigInt((recentCounts.get(left.id) ?? 0) + 1);
  const rightRecent = BigInt((recentCounts.get(right.id) ?? 0) + 1);
  const leftScore = leftNumerator * rightDenominator * rightRecent;
  const rightScore = rightNumerator * leftDenominator * leftRecent;
  if (leftScore !== rightScore) return leftScore > rightScore ? -1 : 1;
  return compareExploration(left, right);
}

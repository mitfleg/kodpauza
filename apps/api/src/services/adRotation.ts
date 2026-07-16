const CAMPAIGN_COOLDOWN_WINDOWS = 2;

export const AD_ROTATION_HISTORY_SIZE = 1_000;

type RotatableCampaign = {
  id: string;
  billableCpmKopecks: number;
  createdAt: Date;
};

export function selectRotatedCampaign<T extends RotatableCampaign>(
  campaigns: readonly T[],
  serveHistory: readonly { campaignId: string }[],
): T | undefined {
  if (campaigns.length === 0) return undefined;

  const eligibleIds = new Set(campaigns.map((campaign) => campaign.id));
  const history = serveHistory.filter((serve) => eligibleIds.has(serve.campaignId));
  const cooldownSize = Math.min(CAMPAIGN_COOLDOWN_WINDOWS, campaigns.length - 1);
  const cooldownIds = new Set(history.slice(0, cooldownSize).map((serve) => serve.campaignId));
  const candidates = campaigns.filter((campaign) => !cooldownIds.has(campaign.id));
  const serveCounts = new Map<string, number>();

  for (const serve of history) {
    serveCounts.set(serve.campaignId, (serveCounts.get(serve.campaignId) ?? 0) + 1);
  }

  return candidates.reduce<T | undefined>((selected, campaign) => {
    if (!selected) return campaign;

    const campaignCount = BigInt(serveCounts.get(campaign.id) ?? 0);
    const selectedCount = BigInt(serveCounts.get(selected.id) ?? 0);
    const campaignWeight = BigInt(campaign.billableCpmKopecks);
    const selectedWeight = BigInt(selected.billableCpmKopecks);
    const campaignRatio = campaignCount * selectedWeight;
    const selectedRatio = selectedCount * campaignWeight;

    if (campaignRatio !== selectedRatio) {
      return campaignRatio < selectedRatio ? campaign : selected;
    }
    if (campaign.billableCpmKopecks !== selected.billableCpmKopecks) {
      return campaign.billableCpmKopecks > selected.billableCpmKopecks ? campaign : selected;
    }
    if (campaign.createdAt.getTime() !== selected.createdAt.getTime()) {
      return campaign.createdAt < selected.createdAt ? campaign : selected;
    }
    return campaign.id < selected.id ? campaign : selected;
  }, undefined);
}

export type UtmValues = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

export function buildCampaignUrl(baseUrl: string, values: UtmValues) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const pairs = [
      ['utm_source', values.source],
      ['utm_medium', values.medium],
      ['utm_campaign', values.campaign],
      ['utm_content', values.content],
    ] as const;
    for (const [name, value] of pairs) {
      const normalized = value?.trim();
      if (normalized) url.searchParams.set(name, normalized);
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export function adDisplayText(value: string): string {
  const source = value.trim();
  const withoutDisclosure = source.replace(/^(?:Реклама|Advertisement)\s*:\s*/i, '').trim();
  return withoutDisclosure || 'Узнать подробнее';
}

export function adPresentationText(campaignName: string, offer: string): string {
  const advertiser = campaignName.trim() || 'Kodpauza';
  const cleanOffer = adDisplayText(offer);
  const prefix = `${advertiser} · `;
  return cleanOffer.toLowerCase().startsWith(prefix.toLowerCase())
    ? cleanOffer
    : `${prefix}${cleanOffer}`;
}

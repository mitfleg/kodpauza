export function adDisplayText(value: string): string {
  const source = value.trim();
  const withoutDisclosure = source.replace(/^(?:Реклама|Advertisement)(?:\s*[·:]\s*)?/i, '').trim();
  return withoutDisclosure || 'Узнать подробнее';
}

export function adPresentationText(advertiserName: string, offer: string): string {
  const advertiser = advertiserName.trim() || 'Kodpauza';
  const cleanOffer = adDisplayText(offer);
  const advertiserPrefix = `${advertiser} · `;
  const offerWithoutAdvertiser = cleanOffer.toLowerCase().startsWith(advertiserPrefix.toLowerCase())
    ? cleanOffer.slice(advertiserPrefix.length).trim() || 'Узнать подробнее'
    : cleanOffer;
  return `Реклама · ${advertiser} · ${offerWithoutAdvertiser}`;
}

type ComplianceAdvertiser = {
  companyName: string;
  publicName: string;
  advertiserInfoUrl: string | null;
  inn: string | null;
};

type ComplianceCreative = {
  label: string;
  erid: string | null;
};

export function campaignComplianceIssues(
  advertiser: ComplianceAdvertiser,
  creatives: ComplianceCreative[],
): string[] {
  const issues: string[] = [];
  const legalName = advertiser.companyName.trim();
  if (legalName.length < 2 || /^(?:компания|ооо\s+тест)$/i.test(legalName)) {
    issues.push('укажите настоящее юридическое имя рекламодателя');
  }
  if (!/^(?:\d{10}|\d{12})$/.test(advertiser.inn?.trim() ?? '')) {
    issues.push('укажите ИНН из 10 или 12 цифр');
  }
  if (advertiser.publicName.trim().length < 2) {
    issues.push('укажите публичное название бренда');
  }
  if (!isSafeAdvertiserInfoUrl(advertiser.advertiserInfoUrl)) {
    issues.push('укажите публичную HTTPS-страницу со сведениями о рекламодателе');
  }
  if (creatives.length === 0) {
    issues.push('добавьте хотя бы один активный креатив');
  }
  for (const creative of creatives) {
    if (!creative.erid?.trim()) {
      issues.push(`укажите ERID для креатива «${creative.label}»`);
    }
  }
  return issues;
}

function isSafeAdvertiserInfoUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

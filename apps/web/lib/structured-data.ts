import { absoluteUrl, DEFAULT_DESCRIPTION, SITE_NAME } from './seo';
import { EXTENSION_VERSION } from './extension-release';

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${absoluteUrl('/')}#organization`,
  name: SITE_NAME,
  url: absoluteUrl('/'),
  logo: absoluteUrl('/icon.svg'),
  description: DEFAULT_DESCRIPTION,
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${absoluteUrl('/')}#website`,
  name: SITE_NAME,
  alternateName: 'Кодпауза',
  url: absoluteUrl('/'),
  inLanguage: 'ru-RU',
  publisher: { '@id': `${absoluteUrl('/')}#organization` },
};

export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${absoluteUrl('/install')}#software`,
  name: 'Kodpauza для Visual Studio Code',
  alternateName: 'Kodpauza',
  description:
    'Расширение для показа нативной рекламы во время ожидания ответа Codex и Claude Code с начислением дохода разработчику.',
  url: absoluteUrl('/install'),
  downloadUrl: absoluteUrl('/downloads/kodpauza.vsix'),
  softwareVersion: EXTENSION_VERSION,
  operatingSystem: 'Windows, macOS, Linux',
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Visual Studio Code Extension',
  inLanguage: 'ru-RU',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'RUB',
    availability: 'https://schema.org/InStock',
    url: absoluteUrl('/install'),
  },
  publisher: { '@id': `${absoluteUrl('/')}#organization` },
  featureList: [
    'Показ рекламы только во время ожидания ответа AI',
    'Интеграция с Codex и Claude Code',
    'Учет подтвержденной видимости объявления',
    'Личный кабинет с доходом и событиями',
    'Без доступа к исходному коду и запросам',
  ],
};

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function serviceJsonLd({
  id,
  name,
  description,
  path,
  audience,
}: {
  id: string;
  name: string;
  description: string;
  path: string;
  audience: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${absoluteUrl(path)}#${id}`,
    name,
    description,
    url: absoluteUrl(path),
    areaServed: 'RU',
    availableLanguage: 'ru-RU',
    audience: {
      '@type': 'Audience',
      audienceType: audience,
    },
    provider: { '@id': `${absoluteUrl('/')}#organization` },
  };
}

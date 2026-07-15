import type { Metadata } from 'next';

export const SITE_NAME = 'Kodpauza';
export const SITE_URL = new URL('https://kodpauza.ru');
export const DEFAULT_DESCRIPTION =
  'Kodpauza показывает нативную рекламу в паузах Codex и Claude Code, помогает разработчикам зарабатывать, а рекламодателям — работать с технической аудиторией.';

export const publicRobots: Metadata['robots'] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
};

export const privateRobots: Metadata['robots'] = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

export function absoluteUrl(path = '/') {
  return new URL(path, SITE_URL).toString();
}

export function buildPublicMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: publicRobots,
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: SITE_NAME,
      title,
      description,
      url: path,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export function searchVerification(): Metadata['verification'] | undefined {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const yandex = process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION?.trim();
  const bing = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

  if (!google && !yandex && !bing) return undefined;

  return {
    ...(google ? { google } : {}),
    ...(yandex ? { yandex } : {}),
    ...(bing ? { other: { 'msvalidate.01': bing } } : {}),
  };
}

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kodpauza — реклама в паузах разработки',
    short_name: 'Kodpauza',
    description:
      'Нативная реклама во время ожидания Codex и Claude Code с доходом для разработчиков.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f8fb',
    theme_color: '#17202a',
    lang: 'ru-RU',
    categories: ['business', 'developer tools', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}

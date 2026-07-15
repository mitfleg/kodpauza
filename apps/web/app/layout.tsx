import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { YandexMetrika } from '@/components/yandex-metrika';
import { AuthProvider } from '@/lib/auth-state';
import {
  DEFAULT_DESCRIPTION,
  publicRobots,
  searchVerification,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  title: {
    default: 'Kodpauza — реклама в Codex и Claude Code',
    template: '%s | Kodpauza',
  },
  description: DEFAULT_DESCRIPTION,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'technology',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
    apple: '/apple-icon',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  referrer: 'strict-origin-when-cross-origin',
  robots: publicRobots,
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: SITE_NAME,
    title: 'Kodpauza — реклама в Codex и Claude Code',
    description: DEFAULT_DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kodpauza — реклама в Codex и Claude Code',
    description: DEFAULT_DESCRIPTION,
  },
  verification: searchVerification(),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" dir="ltr">
      <body>
        <YandexMetrika />
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto min-h-[calc(100vh-129px)] w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            {children}
          </main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}

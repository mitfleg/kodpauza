import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { AuthProvider } from '@/lib/auth-state';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://kodpauza.ru'),
  title: {
    default: 'kodpauza',
    template: '%s | kodpauza',
  },
  description: 'Kodpauza помогает разработчикам зарабатывать во время работы Codex и Claude Code.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
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

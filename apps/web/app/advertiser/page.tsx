import type { Metadata } from 'next';
import { AdvertiserPanel } from '@/components/role-panels/advertiser-panel';
import { PageShell } from '@/components/page-shell';
import { AuthGate } from '@/components/auth-gate';

export const metadata: Metadata = {
  title: 'Кабинет рекламодателя',
};

export default function AdvertiserPage() {
  return (
    <PageShell
      eyebrow="Кабинет рекламодателя"
      title="Обзор рекламы"
      description="Баланс и основные результаты без лишних деталей."
      compact
    >
      <AuthGate roles={['advertiser']}>
        <AdvertiserPanel />
      </AuthGate>
    </PageShell>
  );
}

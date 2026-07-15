import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';
import { AdvertiserBillingPanel } from '@/components/role-panels/advertiser-billing-panel';

export const metadata: Metadata = { title: 'Баланс рекламодателя' };

export default function AdvertiserBillingPage() {
  return (
    <PageShell eyebrow="Кабинет рекламодателя" title="Баланс" description="Пополнение и история операций." compact>
      <AuthGate roles={['advertiser']}><AdvertiserBillingPanel /></AuthGate>
    </PageShell>
  );
}

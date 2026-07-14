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
      title="Рекламные кампании и результаты"
      description="Создавайте объявления для аудитории разработчиков, управляйте расходами и отслеживайте каждый засчитанный показ."
    >
      <AuthGate roles={['advertiser']}>
        <AdvertiserPanel />
      </AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';
import { AdvertiserNewCampaignPanel } from '@/components/role-panels/advertiser-new-campaign-panel';

export const metadata: Metadata = { title: 'Новая рекламная кампания' };

export default function AdvertiserNewCampaignPage() {
  return (
    <PageShell eyebrow="Кабинет рекламодателя" title="Новая кампания" description="Создайте объявление и отправьте его на модерацию." compact>
      <AuthGate roles={['advertiser']}><AdvertiserNewCampaignPanel /></AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';
import { AdvertiserCampaignsPanel } from '@/components/role-panels/advertiser-campaigns-panel';

export const metadata: Metadata = { title: 'Кампании рекламодателя' };

export default function AdvertiserCampaignsPage() {
  return (
    <PageShell eyebrow="Кабинет рекламодателя" title="Кампании" description="Статусы, расходы и управление объявлениями." compact>
      <AuthGate roles={['advertiser']}><AdvertiserCampaignsPanel /></AuthGate>
    </PageShell>
  );
}

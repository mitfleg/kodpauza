import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';
import { PrivacyCenter } from '@/components/privacy-center';

export const metadata: Metadata = { title: 'Мои данные', robots: { index: false, follow: false } };

export default function AccountPrivacyPage() {
  return (
    <PageShell eyebrow="Настройки аккаунта" title="Мои данные" description="Выгрузка данных, исправление, отзыв согласия и заявка на удаление." compact>
      <AuthGate roles={['developer', 'advertiser', 'admin']}><PrivacyCenter /></AuthGate>
    </PageShell>
  );
}

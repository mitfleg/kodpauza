import type { Metadata } from 'next';
import { AccountSettings } from '@/components/account-settings';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = {
  title: 'Настройки аккаунта',
  robots: { index: false, follow: false },
};

export default function AccountSettingsPage() {
  return (
    <PageShell
      eyebrow="Аккаунт"
      title="Настройки"
      description="Основная информация и управление аккаунтом."
      compact
    >
      <AuthGate roles={['developer', 'advertiser', 'admin']}>
        <AccountSettings />
      </AuthGate>
    </PageShell>
  );
}

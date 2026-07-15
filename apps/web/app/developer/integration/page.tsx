import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';
import { DeveloperIntegrationPanel } from '@/components/role-panels/developer-integration-panel';

export const metadata: Metadata = { title: 'Подключение расширения' };

export default function DeveloperIntegrationPage() {
  return (
    <PageShell
      eyebrow="Кабинет разработчика"
      title="Подключение"
      description="Установка расширения и проверка интеграций."
      compact
    >
      <AuthGate roles={['developer']}>
        <DeveloperIntegrationPanel />
      </AuthGate>
    </PageShell>
  );
}

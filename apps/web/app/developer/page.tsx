import type { Metadata } from 'next';
import { DeveloperPanel } from '@/components/role-panels/developer-panel';
import { PageShell } from '@/components/page-shell';
import { AuthGate } from '@/components/auth-gate';

export const metadata: Metadata = {
  title: 'Кабинет разработчика',
};

export default function DeveloperPage() {
  return (
    <PageShell
      eyebrow="Кабинет разработчика"
      title="Обзор дохода"
      description="Баланс и основные результаты за последние 14 дней."
      compact
    >
      <AuthGate roles={['developer']}>
        <DeveloperPanel />
      </AuthGate>
    </PageShell>
  );
}

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
      title="Показы, события и доход расширения"
      description="Следите за рекламными событиями, проверяйте начисления и подключайте расширение VS Code из одного кабинета."
    >
      <AuthGate roles={['developer']}>
        <DeveloperPanel />
      </AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';
import { DeveloperEventsPanel } from '@/components/role-panels/developer-events-panel';

export const metadata: Metadata = { title: 'События разработчика' };

export default function DeveloperEventsPage() {
  return (
    <PageShell
      eyebrow="Кабинет разработчика"
      title="События и начисления"
      description="Журнал показов, кликов и проверок."
      compact
    >
      <AuthGate roles={['developer']}>
        <DeveloperEventsPanel />
      </AuthGate>
    </PageShell>
  );
}

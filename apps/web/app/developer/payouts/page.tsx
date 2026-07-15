import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth-gate';
import { DeveloperPayoutPanel } from '@/components/role-panels/developer-payout-panel';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = {
  title: 'Выплаты разработчику',
};

export default function DeveloperPayoutsPage() {
  return (
    <PageShell
      eyebrow="Кабинет разработчика"
      title="Выплаты"
      description="Заявки на вывод, резерв и история переводов."
      compact
    >
      <AuthGate roles={['developer']}>
        <DeveloperPayoutPanel />
      </AuthGate>
    </PageShell>
  );
}

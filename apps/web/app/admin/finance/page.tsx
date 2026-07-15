import type { Metadata } from 'next';
import { AdminPanel } from '@/components/role-panels/admin-panel';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Финансы платформы' };

export default function AdminFinancePage() {
  return (
    <PageShell
      eyebrow="Администрирование"
      title="Финансы"
      description="Пополнения, выплаты и движение средств."
      compact
    >
      <AuthGate roles={['admin']}>
        <AdminPanel section="finance" />
      </AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AdminPanel } from '@/components/role-panels/admin-panel';
import { PageShell } from '@/components/page-shell';
import { AuthGate } from '@/components/auth-gate';

export const metadata: Metadata = {
  title: 'Админ-панель',
};

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Администрирование"
      title="Управление платформой"
      description="Проверяйте кампании, контролируйте пользователей, события и сигналы антифрода в одном рабочем разделе."
    >
      <AuthGate roles={['admin']}>
        <AdminPanel />
      </AuthGate>
    </PageShell>
  );
}

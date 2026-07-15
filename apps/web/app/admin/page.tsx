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
      title="Обзор платформы"
      description="Главные показатели и задачи, которые требуют решения."
      compact
    >
      <AuthGate roles={['admin']}>
        <AdminPanel />
      </AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AdminPanel } from '@/components/role-panels/admin-panel';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Пользователи' };

export default function AdminUsersPage() {
  return (
    <PageShell
      eyebrow="Администрирование"
      title="Пользователи"
      description="Аккаунты, роли и профили участников платформы."
      compact
    >
      <AuthGate roles={['admin']}>
        <AdminPanel section="users" />
      </AuthGate>
    </PageShell>
  );
}

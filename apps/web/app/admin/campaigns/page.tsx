import type { Metadata } from 'next';
import { AdminPanel } from '@/components/role-panels/admin-panel';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Модерация кампаний' };

export default function AdminCampaignsPage() {
  return (
    <PageShell
      eyebrow="Администрирование"
      title="Модерация"
      description="Проверка и управление рекламными кампаниями."
      compact
    >
      <AuthGate roles={['admin']}>
        <AdminPanel section="campaigns" />
      </AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AdminPanel } from '@/components/role-panels/admin-panel';
import { AuthGate } from '@/components/auth-gate';
import { PageShell } from '@/components/page-shell';

export const metadata: Metadata = { title: 'Безопасность платформы' };

export default function AdminSecurityPage() {
  return (
    <PageShell
      eyebrow="Администрирование"
      title="Безопасность"
      description="События, антифрод, версии интеграций и журнал решений."
      compact
    >
      <AuthGate roles={['admin']}>
        <AdminPanel section="security" />
      </AuthGate>
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { GuestOnly } from '@/components/guest-only';
import { PageShell } from '@/components/page-shell';
import { StatusList } from '@/components/status-list';

export const metadata: Metadata = {
  title: 'Вход',
};

export default function LoginPage() {
  return (
    <PageShell
      eyebrow="Авторизация"
      title="Вход в kodpauza"
      description="Войдите в свой аккаунт. Мы сразу откроем кабинет с доступными для вашей роли инструментами."
      aside={
        <StatusList
          title="После входа"
          items={[
            {
              title: 'Только подтверждённый аккаунт',
              detail: 'Если почта ещё не подтверждена, сначала откроется форма ввода кода.',
            },
            {
              title: 'Аккаунты разделены по ролям',
              detail: 'Данные и действия других ролей недоступны из вашего кабинета.',
            },
          ]}
        />
      }
    >
      <div className="max-w-xl">
        <GuestOnly>
          <AuthForm mode="login" />
        </GuestOnly>
      </div>
    </PageShell>
  );
}

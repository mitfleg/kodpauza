import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { GuestOnly } from '@/components/guest-only';
import { PageShell } from '@/components/page-shell';
import { StatusList } from '@/components/status-list';

export const metadata: Metadata = {
  title: 'Регистрация',
};

export default function RegisterPage() {
  return (
    <PageShell
      eyebrow="Новый аккаунт"
      title="Регистрация в kodpauza"
      description="Выберите роль и подтвердите почту кодом из письма."
      aside={
        <StatusList
          title="Что подготовить"
          items={[
            {
              title: 'Постоянная почта',
              detail: 'Одноразовые и временные адреса не принимаются.',
            },
            {
              title: 'Подтверждение кодом',
              detail: 'До ввода кода аккаунт неактивен и кабинеты закрыты.',
            },
          ]}
        />
      }
    >
      <div className="max-w-xl">
        <GuestOnly>
          <AuthForm mode="register" />
        </GuestOnly>
      </div>
    </PageShell>
  );
}

'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { MailCheck, ShieldCheck } from 'lucide-react';
import { UserRole, useAuthState } from '@/lib/auth-state';

const roleNames: Record<UserRole, string> = {
  developer: 'разработчик',
  advertiser: 'рекламодатель',
  admin: 'администратор',
};

type AuthGateProps = {
  roles: UserRole[];
  children: ReactNode;
};

export function AuthGate({ roles, children }: AuthGateProps) {
  const { user, verificationEmail, isLoading, error, refresh } = useAuthState();

  if (isLoading) {
    return (
      <div className="rounded-md border border-line bg-white p-6 text-sm text-slate-600 shadow-panel">
        Проверяем авторизацию...
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-ink">API временно недоступен</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="focus-ring mt-4 h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (verificationEmail && !user) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 shadow-panel">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-100 text-amber-800">
            <MailCheck aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Подтвердите почту</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
              Аккаунт ещё не активирован. Введите код из письма — до подтверждения ни один кабинет
              не откроется.
            </p>
            <Link
              href="/login"
              className="focus-ring mt-4 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white"
            >
              Ввести код
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-md border border-line bg-white p-6 shadow-panel">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-mint/10 text-mint">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Нужен вход</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Этот раздел закрыт. Войдите под подходящей ролью, чтобы увидеть кабинет и рабочие
              данные.
            </p>
            <Link
              href="/login"
              className="focus-ring mt-4 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white"
            >
              Перейти ко входу
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="rounded-md border border-line bg-white p-6 shadow-panel">
        <h2 className="text-xl font-semibold text-ink">Нет доступа</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Вы вошли как {roleNames[user.role]}. Для этого раздела нужна роль:{' '}
          {roles.map((role) => roleNames[role]).join(', ')}.
        </p>
      </div>
    );
  }

  return children;
}

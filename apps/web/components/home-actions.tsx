'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useAuthState } from '@/lib/auth-state';
import { roleHome } from '@/lib/navigation';

export function HomeActions() {
  const { user, isLoading } = useAuthState();

  if (isLoading) {
    return <div className="h-11 w-72 animate-pulse rounded-md bg-slate-200" aria-label="Проверяем сессию" />;
  }

  if (user) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href={roleHome[user.role]} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800">
          Открыть мой кабинет
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
        {user.role === 'developer' ? (
          <Link href="/install" className="focus-ring inline-flex h-11 items-center justify-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-slate-50">
            Установить расширение
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link href="/register" className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800">
        Создать аккаунт
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
      <Link href="/login" className="focus-ring inline-flex h-11 items-center justify-center rounded-md border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-slate-50">
        Войти
      </Link>
    </div>
  );
}

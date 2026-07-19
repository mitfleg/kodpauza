'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { useAuthState } from '@/lib/auth-state';
import { roleHome } from '@/lib/navigation';

type HomeActionsProps = {
  tone?: 'light' | 'dark';
};

export function HomeActions({ tone = 'light' }: HomeActionsProps) {
  const { user, isLoading } = useAuthState();
  const dark = tone === 'dark';

  if (isLoading) {
    return (
      <div
        className={clsx(
          'h-11 w-72 animate-pulse rounded-md',
          dark ? 'bg-white/15' : 'bg-slate-200',
        )}
        aria-label="Проверяем сессию"
      />
    );
  }

  if (user) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={roleHome[user.role]}
          className={clsx(
            'focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition',
            dark ? 'bg-white text-ink hover:bg-slate-100' : 'bg-ink text-white hover:bg-slate-800',
          )}
        >
          Открыть мой кабинет
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
        {user.role === 'developer' ? (
          <Link
            href="/install"
            className={clsx(
              'focus-ring inline-flex h-11 items-center justify-center rounded-md border px-5 text-sm font-semibold transition',
              dark
                ? 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                : 'border-line bg-white text-ink hover:bg-slate-50',
            )}
          >
            Установить расширение
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link
        href="/install"
        className={clsx(
          'focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition',
          dark ? 'bg-white text-ink hover:bg-slate-100' : 'bg-ink text-white hover:bg-slate-800',
        )}
      >
        Установить бесплатно
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Link>
      <Link
        href="/for-advertisers"
        className={clsx(
          'focus-ring inline-flex h-11 items-center justify-center rounded-md border px-5 text-sm font-semibold transition',
          dark
            ? 'border-white/20 bg-white/5 text-white hover:bg-white/10'
            : 'border-line bg-white text-ink hover:bg-slate-50',
        )}
      >
        Запустить рекламу
      </Link>
    </div>
  );
}

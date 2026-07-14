'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { roleHome } from '@/lib/navigation';
import { useAuthState } from '@/lib/auth-state';

export function GuestOnly({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuthState();

  useEffect(() => {
    if (user) router.replace(roleHome[user.role]);
  }, [router, user]);

  if (isLoading || user) {
    return (
      <div className="rounded-md border border-line bg-white p-6 shadow-panel" aria-live="polite">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-11 animate-pulse rounded-md bg-slate-100" />
        <p className="mt-4 text-sm text-slate-500">
          {user ? 'Открываем ваш кабинет...' : 'Проверяем сессию...'}
        </p>
      </div>
    );
  }

  return children;
}

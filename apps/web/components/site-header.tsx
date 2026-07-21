'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Code2, LogIn, LogOut, Menu, Settings, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { publicNav, roleLabel, roleNavigation } from '@/lib/navigation';
import { useAuthState } from '@/lib/auth-state';

function matchesPath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function activeNavigationHref(pathname: string, links: Array<{ href: string }>) {
  return links
    .filter((item) => matchesPath(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const { user, isLoading, logout } = useAuthState();
  const links = user ? roleNavigation[user.role] : publicNav;
  const activeHref = activeNavigationHref(pathname, links);

  function handleLogout() {
    logout();
    setIsOpen(false);
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="focus-ring flex shrink-0 items-center gap-3 rounded-md"
          aria-label="Kodpauza"
        >
          <span className="grid h-9 w-9 place-items-center rounded-md bg-ink text-white shadow-sm">
            <Code2 aria-hidden className="h-5 w-5" />
          </span>
          <span className="leading-none">
            <span className="block text-base font-bold text-ink">kodpauza</span>
            <span className="mt-1 hidden text-[11px] font-medium text-slate-500 2xl:block">
              рекламная пауза в VS Code
            </span>
          </span>
        </Link>

        <div className="hidden h-7 w-px bg-line lg:block" aria-hidden />

        <nav
          className="hidden min-w-0 flex-1 items-center gap-1 lg:flex"
          aria-label="Основная навигация"
        >
          {!isLoading ? (
            links.map((item) => {
              const Icon = item.icon;
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'focus-ring inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm font-semibold transition xl:px-3',
                    active
                      ? 'bg-slate-100 text-ink'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-ink',
                  )}
                >
                  <Icon aria-hidden className={clsx('h-4 w-4', active && 'text-mint')} />
                  {item.label}
                </Link>
              );
            })
          ) : (
            <div className="h-9 w-64 animate-pulse rounded-md bg-slate-100" aria-hidden />
          )}
        </nav>

        <div className="ml-2 hidden shrink-0 items-center gap-2 border-l border-line pl-4 lg:flex">
          {isLoading ? (
            <div
              className="h-9 w-40 animate-pulse rounded-md bg-slate-100"
              aria-label="Проверяем сессию"
            />
          ) : user ? (
            <>
              <div className="min-w-0 border-r border-line pr-4 text-right">
                <p className="text-xs font-semibold text-ink">{roleLabel[user.role]}</p>
                <p className="mt-0.5 max-w-52 truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <Link
                href="/account/settings"
                className="focus-ring grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                aria-label="Настройки аккаунта"
                title="Настройки аккаунта"
              >
                <Settings aria-hidden className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="focus-ring grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                aria-label="Выйти из аккаунта"
                title="Выйти"
              >
                <LogOut aria-hidden className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="focus-ring inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogIn aria-hidden className="h-4 w-4" />
                Войти
              </Link>
              <Link
                href="/register"
                className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <UserPlus aria-hidden className="h-4 w-4" />
                Создать аккаунт
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="focus-ring ml-auto grid h-10 w-10 place-items-center rounded-md border border-line bg-white text-slate-700 lg:hidden"
          aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? (
            <X aria-hidden className="h-5 w-5" />
          ) : (
            <Menu aria-hidden className="h-5 w-5" />
          )}
        </button>
      </div>

      {isOpen ? (
        <nav
          className="border-t border-line bg-white px-4 py-4 lg:hidden"
          aria-label="Мобильная навигация"
        >
          <div className="mx-auto grid max-w-[1440px] gap-2">
            {isLoading ? (
              <div className="h-11 animate-pulse rounded-md bg-slate-100" />
            ) : (
              <>
                {user ? (
                  <div className="mb-2 rounded-md bg-slate-50 px-3 py-3">
                    <p className="text-xs font-semibold text-ink">{roleLabel[user.role]}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                ) : null}
                {links.map((item) => {
                  const Icon = item.icon;
                  const active = activeHref === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setIsOpen(false)}
                      className={clsx(
                        'focus-ring flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold',
                        active ? 'bg-slate-100 text-ink' : 'text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      <Icon aria-hidden className={clsx('h-4 w-4', active && 'text-mint')} />
                      {item.label}
                    </Link>
                  );
                })}
                {user ? (
                  <div className="mt-2 grid gap-1 border-t border-line pt-2">
                    <Link
                      href="/account/settings"
                      onClick={() => setIsOpen(false)}
                      className="focus-ring flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      <Settings aria-hidden className="h-4 w-4" />
                      Настройки аккаунта
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="focus-ring flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-red-700"
                    >
                      <LogOut aria-hidden className="h-4 w-4" />
                      Выйти
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-4">
                    <Link
                      href="/login"
                      onClick={() => setIsOpen(false)}
                      className="focus-ring inline-flex h-11 items-center justify-center rounded-md border border-line text-sm font-semibold text-ink"
                    >
                      Войти
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setIsOpen(false)}
                      className="focus-ring inline-flex h-11 items-center justify-center rounded-md bg-ink px-3 text-center text-sm font-semibold text-white"
                    >
                      Регистрация
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

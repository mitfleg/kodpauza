'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import {
  cookieConsentChangedEvent,
  readCookieConsent,
  saveCookieConsent,
} from '@/lib/cookie-consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(!readCookieConsent());
    sync();
    window.addEventListener(cookieConsentChangedEvent, sync);
    return () => window.removeEventListener(cookieConsentChangedEvent, sync);
  }, []);
  if (!visible) return null;

  function acknowledge() {
    saveCookieConsent(true);
    setVisible(false);
  }

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-md border border-line bg-white/95 px-3 py-3 shadow-2xl backdrop-blur sm:px-4"
      aria-label="Уведомление о cookie"
    >
      <div className="flex items-center gap-3">
        <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700 sm:grid">
          <Cookie aria-hidden className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-xs leading-5 text-slate-600">
          Cookie помогают входу и аналитике сайта.{' '}
          <Link href="/cookies" className="font-semibold text-ink underline underline-offset-2">
            Настройки
          </Link>
        </p>
        <button
          type="button"
          onClick={acknowledge}
          className="focus-ring inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <span>Понятно</span>
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}

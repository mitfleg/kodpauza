'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
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
    <aside className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-3xl rounded-md border border-line bg-white p-4 shadow-2xl sm:p-5" aria-label="Уведомление о cookie">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Cookie aria-hidden className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-ink">Cookie на сайте</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Мы используем обязательные cookie для входа и настроек, а Яндекс Метрику — для статистики посещений и улучшения сайта. Аналитику можно отключить в настройках.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={acknowledge} className="focus-ring h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800">Понятно</button>
            <Link href="/cookies" className="focus-ring inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink hover:bg-slate-50">Подробнее и настройки</Link>
          </div>
        </div>
      </div>
    </aside>
  );
}

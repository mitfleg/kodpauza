'use client';

import { useEffect, useState } from 'react';
import { readCookieConsent, saveCookieConsent, type CookieConsent } from '@/lib/cookie-consent';

export function CookiePreferences() {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [saved, setSaved] = useState(false);
  const analyticsEnabled = consent?.analytics !== false;

  useEffect(() => setConsent(readCookieConsent()), []);
  function update(analytics: boolean) {
    setConsent(saveCookieConsent(analytics));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2_000);
  }

  return (
    <div className="rounded-md border border-line bg-slate-50 p-4">
      <p className="font-medium text-ink">Текущая настройка: {analyticsEnabled ? 'аналитика включена' : 'аналитика отключена'}</p>
      {!consent ? <p className="mt-1 text-xs text-slate-500">Аналитика включена по умолчанию. Вы можете отключить её ниже.</p> : null}
      {consent ? <p className="mt-1 text-xs text-slate-500">Сохранено {new Date(consent.decidedAt).toLocaleString('ru-RU')}</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => update(false)} className="focus-ring h-10 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink">Отключить аналитику</button>
        <button type="button" onClick={() => update(true)} className="focus-ring h-10 rounded-md bg-ink px-4 text-sm font-semibold text-white">Включить аналитику</button>
      </div>
      {saved ? <p className="mt-2 text-sm font-medium text-emerald-700" aria-live="polite">Настройка сохранена.</p> : null}
    </div>
  );
}

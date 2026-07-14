'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  language: string;
  theme: 'light';
  appearance: 'interaction-only';
};

type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const developmentSiteKey = '1x00000000000000000000AA';
const configuredSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const developmentToken = process.env.NEXT_PUBLIC_CAPTCHA_DEV_TOKEN ?? 'kodpauza-local-captcha-pass';
const localDevelopment = process.env.NEXT_PUBLIC_LOCAL_DEVELOPMENT === 'true';
const localCaptchaBypass = process.env.NODE_ENV === 'development' || localDevelopment;
const usesDevelopmentSiteKey =
  (!configuredSiteKey || configuredSiteKey === developmentSiteKey) && localCaptchaBypass;
const siteKey = configuredSiteKey || (usesDevelopmentSiteKey ? developmentSiteKey : '');

type CaptchaWidgetProps = {
  onTokenChange: (token: string | null) => void;
  resetKey: number;
};

export function CaptchaWidget({ onTokenChange, resetKey }: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!localCaptchaBypass && window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!localCaptchaBypass) return;
    setError('');
    onTokenChange(developmentToken);
  }, [onTokenChange, resetKey]);

  useEffect(() => {
    if (localCaptchaBypass) return;
    onTokenChange(null);

    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return;

    setError('');
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      language: 'ru',
      theme: 'light',
      appearance: 'interaction-only',
      callback: (token) => {
        setError('');
        onTokenChange(usesDevelopmentSiteKey ? developmentToken : token);
      },
      'expired-callback': () => onTokenChange(null),
      'error-callback': () => {
        onTokenChange(null);
        setError('Не удалось пройти проверку. Обновите капчу и попробуйте ещё раз.');
      },
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onTokenChange, reloadKey, resetKey, scriptReady]);

  if (localCaptchaBypass) return null;

  if (!siteKey) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm leading-6 text-red-700">
        Регистрация временно недоступна: на сайте не настроен ключ CAPTCHA.
      </div>
    );
  }

  return (
    <div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() =>
          setError('Не удалось загрузить CAPTCHA. Проверьте соединение и повторите попытку.')
        }
      />
      <div ref={containerRef} />
      {error ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 font-semibold hover:bg-red-100"
          >
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            Обновить
          </button>
        </div>
      ) : null}
    </div>
  );
}

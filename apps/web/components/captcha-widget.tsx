'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type SmartCaptchaWidgetId = string | number;
type SmartCaptchaEvent =
  | 'challenge-visible'
  | 'challenge-hidden'
  | 'network-error'
  | 'javascript-error'
  | 'success'
  | 'token-expired';

type SmartCaptchaOptions = {
  sitekey: string;
  callback: (token: string) => void;
  hl: 'ru';
};

type SmartCaptchaApi = {
  render: (element: HTMLElement, options: SmartCaptchaOptions) => SmartCaptchaWidgetId;
  reset: (widgetId?: SmartCaptchaWidgetId) => void;
  destroy: (widgetId?: SmartCaptchaWidgetId) => void;
  subscribe: (
    widgetId: SmartCaptchaWidgetId,
    event: SmartCaptchaEvent,
    callback: (...args: unknown[]) => void,
  ) => () => void;
};

declare global {
  interface Window {
    smartCaptcha?: SmartCaptchaApi;
  }
}

const siteKey = process.env.NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY ?? '';
const developmentToken = process.env.NEXT_PUBLIC_CAPTCHA_DEV_TOKEN ?? 'kodpauza-local-captcha-pass';
const localDevelopment = process.env.NEXT_PUBLIC_LOCAL_DEVELOPMENT === 'true';
const localCaptchaBypass = process.env.NODE_ENV === 'development' || localDevelopment;

type CaptchaWidgetProps = {
  onTokenChange: (token: string | null) => void;
  resetKey: number;
};

export function CaptchaWidget({ onTokenChange, resetKey }: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<SmartCaptchaWidgetId | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!localCaptchaBypass && window.smartCaptcha) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!localCaptchaBypass) return;
    setError('');
    onTokenChange(developmentToken);
  }, [onTokenChange, resetKey]);

  useEffect(() => {
    if (localCaptchaBypass) return;
    onTokenChange(null);

    if (!siteKey || !scriptReady || !containerRef.current || !window.smartCaptcha) return;

    setError('');
    const widgetId = window.smartCaptcha.render(containerRef.current, {
      sitekey: siteKey,
      hl: 'ru',
      callback: (token) => {
        setError('');
        onTokenChange(token);
      },
    });
    widgetIdRef.current = widgetId;
    const unsubscribe = [
      window.smartCaptcha.subscribe(widgetId, 'token-expired', () => onTokenChange(null)),
      window.smartCaptcha.subscribe(widgetId, 'network-error', () => {
        onTokenChange(null);
        setError('Не удалось пройти проверку. Обновите капчу и попробуйте ещё раз.');
      }),
      window.smartCaptcha.subscribe(widgetId, 'javascript-error', () => {
        onTokenChange(null);
        setError('Не удалось пройти проверку. Обновите капчу и попробуйте ещё раз.');
      }),
    ];

    return () => {
      for (const unsubscribeEvent of unsubscribe) unsubscribeEvent();
      if (widgetIdRef.current !== null && window.smartCaptcha) {
        window.smartCaptcha.destroy(widgetIdRef.current);
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
        src="https://smartcaptcha.cloud.yandex.ru/captcha.js?render=onload"
        strategy="afterInteractive"
        onReady={() => setScriptReady(Boolean(window.smartCaptcha))}
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

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  YANDEX_METRIKA_ENABLED,
  YANDEX_METRIKA_ID,
  type YandexMetrikaFunction,
} from '@/lib/metrika';

const scriptId = 'yandex-metrika-script';

function initializeMetrika() {
  if (!window.ym) {
    const queuedMetrika: YandexMetrikaFunction = (...args: unknown[]) => {
      (queuedMetrika.a ??= []).push(args);
    };
    queuedMetrika.l = Date.now();
    window.ym = queuedMetrika;
  }

  if (!document.getElementById(scriptId)) {
    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`;
    document.head.appendChild(script);
  }

  if (!window.__kodpauzaMetrikaInitialized) {
    window.ym(YANDEX_METRIKA_ID, 'init', {
      accurateTrackBounce: true,
      clickmap: true,
      referrer: document.referrer,
      ssr: true,
      trackLinks: true,
      url: window.location.href,
      webvisor: true,
    });
    window.__kodpauzaMetrikaInitialized = true;
  }
}

export function YandexMetrika() {
  const pathname = usePathname();
  const previousUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!YANDEX_METRIKA_ENABLED) return;
    initializeMetrika();
    previousUrl.current = window.location.href;
  }, []);

  useEffect(() => {
    if (!YANDEX_METRIKA_ENABLED || !window.ym) return;

    const currentUrl = window.location.href;
    const referrer = previousUrl.current;
    if (referrer && referrer !== currentUrl) {
      window.ym(YANDEX_METRIKA_ID, 'hit', currentUrl, { referrer });
    }
    previousUrl.current = currentUrl;
  }, [pathname]);

  if (!YANDEX_METRIKA_ENABLED) return null;

  return (
    <noscript>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`}
          alt=""
          height="1"
          width="1"
          style={{ left: '-9999px', position: 'absolute' }}
        />
      </div>
    </noscript>
  );
}

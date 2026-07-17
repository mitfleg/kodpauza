'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  YANDEX_METRIKA_ENABLED,
  YANDEX_METRIKA_ID,
  type YandexMetrikaFunction,
} from '@/lib/metrika';
import { cookieConsentChangedEvent, readCookieConsent } from '@/lib/cookie-consent';

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

function clearMetrikaCookies() {
  const names = ['_ym_uid', '_ym_d', '_ym_isad', '_ym_visorc', '_ym_wv2rf', '_ym_zzlc', 'yabs-sid'];
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; path=/; domain=.${window.location.hostname}; SameSite=Lax`;
  }
}

function disableMetrika() {
  if (window.__kodpauzaMetrikaInitialized && window.ym) {
    window.ym(YANDEX_METRIKA_ID, 'destruct');
  }
  document.getElementById(scriptId)?.remove();
  clearMetrikaCookies();
  window.__kodpauzaMetrikaInitialized = false;
  delete window.ym;
}

export function YandexMetrika() {
  const pathname = usePathname();
  const previousUrl = useRef<string | null>(null);
  const [analyticsAllowed, setAnalyticsAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const protectFields = (root: ParentNode) => {
      if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) {
        root.classList.add('ym-disable-keys');
      }
      root.querySelectorAll('input, textarea').forEach((field) => {
        field.classList.add('ym-disable-keys');
      });
    };
    protectFields(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) protectFields(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const privateArea = /^\/(account|admin|advertiser|developer)(?:\/|$)/.test(pathname);
    document.querySelector('main')?.classList.toggle('ym-hide-content', privateArea);
  }, [pathname]);

  useEffect(() => {
    const sync = () => setAnalyticsAllowed(readCookieConsent()?.analytics !== false);
    sync();
    window.addEventListener(cookieConsentChangedEvent, sync);
    return () => window.removeEventListener(cookieConsentChangedEvent, sync);
  }, []);

  useEffect(() => {
    if (analyticsAllowed === null) return;
    if (!YANDEX_METRIKA_ENABLED || !analyticsAllowed) {
      disableMetrika();
      previousUrl.current = null;
      return;
    }
    initializeMetrika();
    previousUrl.current = window.location.href;
  }, [analyticsAllowed]);

  useEffect(() => {
    if (!YANDEX_METRIKA_ENABLED || !analyticsAllowed || !window.ym) return;

    const currentUrl = window.location.href;
    const referrer = previousUrl.current;
    if (referrer && referrer !== currentUrl) {
      window.ym(YANDEX_METRIKA_ID, 'hit', currentUrl, { referrer });
    }
    previousUrl.current = currentUrl;
  }, [analyticsAllowed, pathname]);

  return null;
}

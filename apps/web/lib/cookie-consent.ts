export const cookieConsentVersion = '2026-07-17';
export const cookieConsentStorageKey = 'kodpauza_cookie_consent';
export const cookieConsentChangedEvent = 'kodpauza-cookie-consent-changed';

export type CookieConsent = {
  version: string;
  analytics: boolean;
  decidedAt: string;
};

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cookieConsentStorageKey) ?? 'null') as CookieConsent | null;
    if (!parsed || parsed.version !== cookieConsentVersion || typeof parsed.analytics !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCookieConsent(analytics: boolean): CookieConsent {
  const consent = { version: cookieConsentVersion, analytics, decidedAt: new Date().toISOString() };
  window.localStorage.setItem(cookieConsentStorageKey, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent(cookieConsentChangedEvent, { detail: consent }));
  return consent;
}

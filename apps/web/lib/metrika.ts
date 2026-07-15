export const YANDEX_METRIKA_ID = 110764616;

export const YANDEX_METRIKA_ENABLED = process.env.NODE_ENV === 'production';

export type MetrikaGoal =
  | 'registration_started'
  | 'registration_completed'
  | 'extension_download'
  | 'campaign_created';

type MetrikaParams = Record<string, boolean | number | string>;

export type YandexMetrikaFunction = ((...args: unknown[]) => void) & {
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: YandexMetrikaFunction;
    __kodpauzaMetrikaInitialized?: boolean;
  }
}

export function reachMetrikaGoal(goal: MetrikaGoal, params?: MetrikaParams) {
  if (!YANDEX_METRIKA_ENABLED || typeof window === 'undefined' || !window.ym) return;
  window.ym(YANDEX_METRIKA_ID, 'reachGoal', goal, params);
}

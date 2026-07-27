const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class UnsafeUrlError extends Error {
  constructor(label: string) {
    super(`${label}: разрешены HTTPS-адреса и HTTP только для localhost.`);
    this.name = 'UnsafeUrlError';
  }
}

export function parseSafeHttpUrl(value: string, label = 'Некорректный адрес'): URL {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new UnsafeUrlError(label);
  }

  const isHttps = url.protocol === 'https:';
  const isLoopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());

  if ((!isHttps && !isLoopbackHttp) || url.username || url.password) {
    throw new UnsafeUrlError(label);
  }

  return url;
}

export function normalizeApiBaseUrl(value: string): string {
  const url = parseSafeHttpUrl(value, 'Некорректный адрес API Kodpauza');

  if (url.search || url.hash) {
    throw new UnsafeUrlError('Некорректный адрес API Kodpauza');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export function normalizeExternalUrl(value: string, label = 'Некорректная внешняя ссылка'): string {
  return parseSafeHttpUrl(value, label).toString();
}

export function normalizeAdClickUrl(
  value: string,
  erid: string | null | undefined,
  label = 'Некорректная ссылка объявления',
): string {
  const url = parseSafeHttpUrl(value, label);
  const token = erid?.trim();

  if (token) {
    url.searchParams.set('erid', token);
  }

  return url.toString();
}

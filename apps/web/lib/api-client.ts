export type ApiClientOptions = {
  token?: string;
  headers?: HeadersInit;
  timeoutMs?: number;
};

export type ApiErrorPayload = {
  message?: string;
  error?: string;
  code?: string;
  email?: string;
  verificationRequired?: boolean;
  statusCode?: number;
  retryAfter?: number;
  retryAfterSeconds?: number;
};

export class ApiClientError extends Error {
  status: number;
  payload: ApiErrorPayload | unknown;
  retryAfterSeconds?: number;

  constructor(status: number, payload: ApiErrorPayload | unknown, headers?: Headers) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String((payload as ApiErrorPayload).message)
        : typeof payload === 'object' && payload !== null && 'error' in payload
          ? String((payload as ApiErrorPayload).error)
          : `Ошибка API: ${status}`;

    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;

    const typedPayload =
      typeof payload === 'object' && payload !== null ? (payload as ApiErrorPayload) : undefined;
    const retryAfterHeader = headers?.get('retry-after');
    const retryAfterFromHeader = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10)
      : undefined;
    const retryAfterFromPayload = typedPayload?.retryAfterSeconds ?? typedPayload?.retryAfter;
    const retryAfter = retryAfterFromPayload ?? retryAfterFromHeader;

    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
      this.retryAfterSeconds = Math.ceil(retryAfter);
    }
  }
}

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(
  /\/+$/,
  '',
);

function buildUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type');

  if (response.status === 204) {
    return null;
  }

  if (contentType?.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: ApiClientOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers,
      credentials: 'include',
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError(0, { error: 'API не ответил вовремя. Повторите запрос.' });
    }
    throw new ApiClientError(0, { error: 'Не удалось связаться с API.' });
  } finally {
    window.clearTimeout(timeout);
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new ApiClientError(response.status, payload, response.headers);
  }

  if (payload === null || (typeof payload !== 'object' && typeof payload !== 'string')) {
    throw new ApiClientError(response.status, { error: 'API вернул некорректный ответ.' });
  }
  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: ApiClientOptions) =>
    apiRequest<T>(path, { method: 'GET' }, options),
  post: <T, TBody extends object>(path: string, body: TBody, options?: ApiClientOptions) =>
    apiRequest<T>(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      options,
    ),
  put: <T, TBody extends object>(path: string, body: TBody, options?: ApiClientOptions) =>
    apiRequest<T>(
      path,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
      options,
    ),
  delete: <T>(path: string, options?: ApiClientOptions) =>
    apiRequest<T>(path, { method: 'DELETE' }, options),
};

export const apiConfig = {
  baseUrl,
};

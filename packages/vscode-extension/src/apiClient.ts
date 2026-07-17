import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { Balance, KodpauzaAd, KodpauzaEvent, KodpauzaEventType, Surface } from './types';
import { normalizeApiBaseUrl, normalizeExternalUrl } from './urls';

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_API_BASE_URL = 'https://api.kodpauza.ru';
const DEFAULT_DASHBOARD_URL = 'https://kodpauza.ru';

export interface LoginResponse {
  token: string;
  refreshToken: string;
  eventSecret: string;
}

type AuthSessionOptions = {
  refreshTokenProvider?: () => Promise<string | undefined>;
  onSession?: (session: LoginResponse) => Promise<void>;
  onSessionInvalid?: () => Promise<void>;
};

export type IntegrationReportTool = 'codex' | 'claude';

export interface IntegrationVersionReportRequest {
  version: string;
  supported: boolean;
  compatibilityMode: 'exact' | 'structural' | 'unsupported';
  clientVersion: string;
  editorName: string;
}

export interface ExtensionInstallHeartbeatRequest {
  installId: string;
  vscodeVersion: string;
  extensionVersion: string;
  os: string;
  integrationsEnabled: boolean;
  codexDetected: boolean;
  claudeDetected: boolean;
}

export class KodpauzaApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'KodpauzaApiError';
  }
}

export class KodpauzaApiClient {
  private lastErrorValue: string | undefined;
  private lastEventAtValue: string | undefined;
  private refreshPromise: Promise<boolean> | undefined;

  constructor(
    private readonly tokenProvider: () => Promise<string | undefined>,
    private readonly eventSecretProvider: () => Promise<string | undefined>,
    private readonly authSession: AuthSessionOptions = {},
  ) {}

  get apiBaseUrl(): string {
    const configured = vscode.workspace
      .getConfiguration('kodpauza')
      .get<string>('apiBaseUrl', DEFAULT_API_BASE_URL);
    return normalizeApiBaseUrl(configured);
  }

  get dashboardUrl(): string {
    const configured = vscode.workspace
      .getConfiguration('kodpauza')
      .get<string>('dashboardUrl', DEFAULT_DASHBOARD_URL);
    return normalizeExternalUrl(configured, 'Некорректный адрес кабинета Kodpauza');
  }

  get lastError(): string | undefined {
    return this.lastErrorValue;
  }

  get lastEventAt(): string | undefined {
    return this.lastEventAtValue;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.request<unknown>(
      '/v1/auth/extension/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      },
      false,
    );

    return parseLoginResponse(response);
  }

  async ensurePersistentSession(): Promise<void> {
    if (await this.authSession.refreshTokenProvider?.()) {
      return;
    }
    if (!(await this.tokenProvider())) {
      return;
    }

    try {
      const response = await this.request<unknown>(
        '/v1/auth/extension/bootstrap',
        { method: 'POST' },
        true,
        false,
      );
      await this.authSession.onSession?.(parseLoginResponse(response));
    } catch (error) {
      if (error instanceof KodpauzaApiError && error.status === 401) {
        await this.authSession.onSessionInvalid?.();
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = await this.authSession.refreshTokenProvider?.();
    if (!refreshToken) {
      return;
    }
    await this.request<unknown>(
      '/v1/auth/extension/logout',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      },
      false,
      false,
    );
  }

  async balance(): Promise<Balance> {
    return this.request<Balance>('/v1/developer/balance', { method: 'GET' });
  }

  async reportIntegrationVersion(
    tool: IntegrationReportTool,
    report: IntegrationVersionReportRequest,
  ): Promise<{ isNew: boolean }> {
    return this.request<{ isNew: boolean }>('/v1/developer/integrations/version-report', {
      method: 'POST',
      body: JSON.stringify({ tool, ...report }),
    });
  }

  async reportCodexVersion(report: IntegrationVersionReportRequest): Promise<{ isNew: boolean }> {
    return this.reportIntegrationVersion('codex', report);
  }

  async reportInstallHeartbeat(
    heartbeat: ExtensionInstallHeartbeatRequest,
  ): Promise<void> {
    await this.request<unknown>('/v1/developer/extension-install', {
      method: 'PUT',
      body: JSON.stringify(heartbeat),
    });
  }

  async currentAd(surface: Surface, signal?: AbortSignal): Promise<KodpauzaAd | undefined> {
    try {
      const response = await this.request<unknown>(
        `/v1/ads/next?surface=${encodeURIComponent(surface)}`,
        {
          method: 'GET',
          signal,
        },
      );
      if (response === undefined) {
        return undefined;
      }
      return parseAd(response, surface);
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      this.lastErrorValue = errorMessage(error);
      return undefined;
    }
  }

  async sendImpression(event: KodpauzaEvent): Promise<void> {
    await this.sendEvent('impression', event);
  }

  async sendClick(event: KodpauzaEvent): Promise<void> {
    await this.sendEvent('click', event);
  }

  async ping(): Promise<void> {
    await this.request<unknown>('/health', { method: 'GET' }, false);
  }

  private async sendEvent(type: KodpauzaEventType, event: KodpauzaEvent): Promise<void> {
    const headers = await this.eventHeaders(type, event);
    await this.request<unknown>(`/v1/events/${type}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    });
    this.lastEventAtValue = new Date().toISOString();
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    withAuth = true,
    allowRefresh = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');

    if (init.body) {
      headers.set('content-type', 'application/json');
    }

    if (withAuth) {
      const token = await this.tokenProvider();
      if (!token) {
        throw new KodpauzaApiError('Сначала войдите в Kodpauza.');
      }
      headers.set('authorization', `Bearer ${token}`);
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (init.signal?.aborted) {
      controller.abort();
    } else {
      init.signal?.addEventListener('abort', onExternalAbort, { once: true });
    }

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (
        response.status === 401 &&
        withAuth &&
        allowRefresh &&
        (await this.refreshAccessToken())
      ) {
        return this.request<T>(path, init, true, false);
      }

      if (!response.ok) {
        throw new KodpauzaApiError(await responseErrorMessage(response), response.status);
      }

      this.lastErrorValue = undefined;
      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new KodpauzaApiError('API Kodpauza вернул повреждённый ответ.');
      }
    } catch (error) {
      const normalized = controller.signal.aborted
        ? new KodpauzaApiError(
            timedOut ? 'Превышено время ожидания ответа Kodpauza.' : 'Запрос Kodpauza отменён.',
          )
        : error instanceof KodpauzaApiError
          ? error
          : new KodpauzaApiError('Не удалось связаться с API Kodpauza.');
      this.lastErrorValue = normalized.message;
      throw normalized;
    } finally {
      clearTimeout(timeout);
      init.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.authSession.refreshTokenProvider || !this.authSession.onSession) {
      return false;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<boolean> {
    const refreshToken = await this.authSession.refreshTokenProvider?.();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await this.request<unknown>(
        '/v1/auth/extension/refresh',
        {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        },
        false,
        false,
      );
      await this.authSession.onSession?.(parseLoginResponse(response));
      return true;
    } catch (error) {
      if (error instanceof KodpauzaApiError && error.status === 401) {
        await this.authSession.onSessionInvalid?.();
      }
      throw error;
    }
  }

  private async eventHeaders(
    type: KodpauzaEventType,
    event: KodpauzaEvent,
  ): Promise<Record<string, string>> {
    const secret = await this.eventSecretProvider();
    if (!secret) {
      throw new KodpauzaApiError('Нет ключа подписи событий. Войдите в Kodpauza заново.');
    }

    const timestamp = new Date().toISOString();
    const signature = crypto
      .createHmac('sha256', secret)
      .update(eventSignaturePayload(type, event, timestamp))
      .digest('hex');

    return {
      'x-kodpauza-timestamp': timestamp,
      'x-kodpauza-signature': `sha256=${signature}`,
    };
  }
}

function parseLoginResponse(response: unknown): LoginResponse {
  if (
    !isRecord(response) ||
    typeof response.token !== 'string' ||
    response.token.length === 0 ||
    typeof response.refreshToken !== 'string' ||
    response.refreshToken.length === 0 ||
    typeof response.eventSecret !== 'string' ||
    response.eventSecret.length === 0
  ) {
    throw new KodpauzaApiError('API Kodpauza вернул некорректные данные авторизации.');
  }

  return {
    token: response.token,
    refreshToken: response.refreshToken,
    eventSecret: response.eventSecret,
  };
}

function eventSignaturePayload(
  type: KodpauzaEventType,
  event: KodpauzaEvent,
  timestamp: string,
): string {
  return [
    'kodpauza-event-v1',
    type,
    timestamp,
    event.eventId,
    event.adId,
    event.campaignId,
    event.surface,
    event.visibleMs ?? '',
    event.clientVersion,
    event.toolName,
    event.toolVersion,
  ].join('\n');
}

async function responseErrorMessage(response: Response): Promise<string> {
  const fallback = `API Kodpauza вернул ошибку ${response.status}.`;
  const text = (await response.text()).trim();
  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    if (isRecord(payload)) {
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : undefined;
      if (message) {
        return message.slice(0, 500);
      }
    }
  } catch {
    // Non-JSON error bodies are intentionally not exposed to the user.
  }

  return fallback;
}

function parseAd(value: unknown, expectedSurface: Surface): KodpauzaAd {
  if (!isRecord(value)) {
    throw new KodpauzaApiError('API Kodpauza вернул некорректное объявление.');
  }

  const durationSec = value.durationSec;
  const erid = value.erid;
  const trackable = value.trackable;
  const format = value.format;
  if (
    typeof value.adId !== 'string' ||
    !value.adId ||
    typeof value.campaignId !== 'string' ||
    !value.campaignId ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    value.text.length > 500 ||
    typeof value.url !== 'string' ||
    typeof value.advertiserName !== 'string' ||
    !value.advertiserName.trim() ||
    value.advertiserName.length > 160 ||
    typeof durationSec !== 'number' ||
    !Number.isFinite(durationSec) ||
    durationSec < 1 ||
    durationSec > 300 ||
    value.surface !== expectedSurface ||
    (erid !== null && typeof erid !== 'string') ||
    typeof trackable !== 'boolean' ||
    (format !== 'standard' && format !== 'premium')
  ) {
    throw new KodpauzaApiError('API Kodpauza вернул некорректное объявление.');
  }

  return {
    adId: value.adId,
    campaignId: value.campaignId,
    text: value.text.trim(),
    url: normalizeExternalUrl(value.url, 'Объявление содержит небезопасную ссылку'),
    erid,
    advertiserName: value.advertiserName.trim(),
    durationSec,
    surface: expectedSurface,
    trackable,
    format,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyCaptcha } from '../src/captcha.js';
import { config } from '../src/config.js';

const originalCaptchaConfig = {
  nodeEnv: config.nodeEnv,
  localDevelopment: config.localDevelopment,
  captchaSecretKey: config.captchaSecretKey,
  captchaVerifyUrl: config.captchaVerifyUrl,
  captchaExpectedHosts: config.captchaExpectedHosts,
  captchaDevToken: config.captchaDevToken,
};

function captchaResponse(
  payload: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Yandex SmartCaptcha verification', () => {
  beforeEach(() => {
    config.nodeEnv = 'production';
    config.localDevelopment = false;
    config.captchaSecretKey = 'ysc2_server-secret';
    config.captchaVerifyUrl = 'https://smartcaptcha.cloud.yandex.ru/validate';
    config.captchaExpectedHosts = ['kodpauza.ru'];
    config.captchaDevToken = 'local-captcha-token';
  });

  afterEach(() => {
    Object.assign(config, originalCaptchaConfig);
    vi.unstubAllGlobals();
  });

  it('sends the Yandex field names and accepts a token for the configured host', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        captchaResponse({ status: 'ok', message: '', host: 'kodpauza.ru' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyCaptcha('one-time-token', '203.0.113.15')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://smartcaptcha.cloud.yandex.ru/validate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect((init?.body as URLSearchParams).toString()).toBe(
      'secret=ysc2_server-secret&token=one-time-token&ip=203.0.113.15',
    );
  });

  it('accepts the expected host when Yandex includes a port', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => captchaResponse({ status: 'ok', host: 'kodpauza.ru:443' })),
    );

    await expect(verifyCaptcha('one-time-token')).resolves.toBe(true);
  });

  it.each([
    [{ status: 'failed', message: '' }, 'a failed verification'],
    [{ status: 'ok', host: '' }, 'an empty host'],
    [{ status: 'ok', host: 'attacker.example' }, 'an unexpected host'],
  ])('rejects %s (%s)', async (payload, _description) => {
    vi.stubGlobal('fetch', vi.fn(async () => captchaResponse(payload)));
    await expect(verifyCaptcha('one-time-token')).resolves.toBe(false);
  });

  it('fails closed when the validation service returns an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => captchaResponse({}, 503)));
    await expect(verifyCaptcha('one-time-token')).resolves.toBe(false);
  });

  it('fails closed when the validation request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unavailable');
      }),
    );
    await expect(verifyCaptcha('one-time-token')).resolves.toBe(false);
  });

  it('keeps the local development bypass without contacting Yandex', async () => {
    config.nodeEnv = 'development';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyCaptcha('local-captcha-token')).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

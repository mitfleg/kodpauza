import { config } from './config.js';

type SmartCaptchaResponse = {
  status?: string;
  host?: string;
};

function normalizeResponseHostname(value: string | undefined): string {
  if (!value) return '';
  try {
    return new URL(`http://${value}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

export async function verifyCaptcha(token: string, remoteIp?: string): Promise<boolean> {
  if (
    (config.nodeEnv !== 'production' || config.localDevelopment) &&
    token === config.captchaDevToken
  ) {
    return true;
  }
  if (!config.captchaSecretKey) return false;

  const body = new URLSearchParams({
    secret: config.captchaSecretKey,
    token,
  });
  if (remoteIp) body.set('ip', remoteIp);

  try {
    const response = await fetch(config.captchaVerifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as SmartCaptchaResponse;
    if (result.status !== 'ok') return false;

    if (config.captchaExpectedHosts.length > 0) {
      const responseHostname = normalizeResponseHostname(result.host);
      return config.captchaExpectedHosts.includes(responseHostname);
    }

    return true;
  } catch {
    return false;
  }
}

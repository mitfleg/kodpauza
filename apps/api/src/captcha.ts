import { config } from './config.js';

type TurnstileResponse = {
  success?: boolean;
};

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
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(config.captchaVerifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileResponse;
    return result.success === true;
  } catch {
    return false;
  }
}

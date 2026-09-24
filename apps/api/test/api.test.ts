import { createHash, createHmac, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  eventSignaturePayload,
  legalDocumentVersions,
  type SignableKodpauzaEvent,
} from '@kodpauza/shared';
import { buildApp } from '../src/app.js';
import { signToken } from '../src/auth.js';
import { config } from '../src/config.js';
import type { EmailVerificationMailer } from '../src/email.js';
import type { AdminNotifier, UnsupportedIntegrationAlert } from '../src/services/adminNotifier.js';
import { prisma } from '../src/prisma.js';
import {
  kopecksToProviderValue,
  type CreateYooKassaPaymentInput,
  type YooKassaClientContract,
  type YooKassaPayment,
} from '../src/services/yookassa.js';

class FakeYooKassaClient implements YooKassaClientContract {
  readonly payments = new Map<string, YooKassaPayment>();
  createCount = 0;
  private nextPaymentTest = true;

  isConfigured() {
    return true;
  }

  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPayment> {
    this.createCount += 1;
    const id = `test-${input.localPaymentId}`;
    const existing = this.payments.get(id);
    if (existing) return structuredClone(existing);
    const providerTest = this.nextPaymentTest;
    this.nextPaymentTest = true;
    const payment: YooKassaPayment = {
      id,
      status: 'pending',
      paid: false,
      amount: { value: kopecksToProviderValue(input.amountKopecks), currency: 'RUB' },
      amountKopecks: input.amountKopecks,
      confirmation: { type: 'redirect', confirmation_url: `https://yookassa.test/pay/${id}` },
      metadata: {
        kodpauza_payment_id: input.localPaymentId,
        kodpauza_advertiser_id: input.advertiserId,
      },
      test: providerTest,
      created_at: new Date().toISOString(),
    };
    this.payments.set(id, payment);
    return structuredClone(payment);
  }

  createLivePaymentOnce() {
    this.nextPaymentTest = false;
  }

  async getPayment(providerPaymentId: string): Promise<YooKassaPayment> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error('Fake payment not found.');
    return structuredClone(payment);
  }

  succeed(providerPaymentId: string) {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error('Fake payment not found.');
    payment.status = 'succeeded';
    payment.paid = true;
    payment.confirmation = undefined;
  }

  cancel(providerPaymentId: string) {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error('Fake payment not found.');
    payment.status = 'canceled';
    payment.paid = false;
    payment.confirmation = undefined;
    payment.cancellation_details = { party: 'payment_network', reason: 'expired_on_confirmation' };
  }
}

const yooKassa = new FakeYooKassaClient();
const verificationCodes = new Map<string, string>();
const emailVerificationMailer: EmailVerificationMailer = {
  async sendVerificationCode(message) {
    verificationCodes.set(message.email.toLowerCase(), message.code);
  },
};
const integrationAlerts: UnsupportedIntegrationAlert[] = [];
const adminNotifier: AdminNotifier = {
  isConfigured: () => true,
  async notifyUnsupportedIntegration(alert) {
    integrationAlerts.push(alert);
  },
};
const app = buildApp({ yooKassaClient: yooKassa, emailVerificationMailer, adminNotifier });

type Login = { token: string; eventSecret: string | null; user: { id: string } };
type ExtensionLogin = Login & { refreshToken: string };
type Ad = {
  adId: string;
  campaignId: string;
  creativeId: string;
  text: string;
  url: string;
  erid: string | null;
  advertiserName: string;
  campaignName: string;
  surface: 'codex_vscode';
  trackable: boolean;
  format: 'standard' | 'premium';
};

const tokenIps = new Map<string, string>();
let nextTestIp = 10;

const legalRegistrationFields = {
  termsAccepted: true,
  termsVersion: legalDocumentVersions.terms,
  privacyAcknowledged: true,
  privacyVersion: legalDocumentVersions.privacy,
  personalDataConsentAccepted: true,
  personalDataConsentVersion: legalDocumentVersions.personalDataConsent,
} as const;

const developerPayoutRecipient = {
  recipientName: 'Иван Иванов',
  sbpPhone: '+7 999 123-45-67',
  bankName: 'Т-Банк',
} as const;

function rememberTokenIp(token: string, ip = `198.51.100.${nextTestIp++}`) {
  tokenIps.set(token, ip);
  return ip;
}

async function login(email: string, password: string): Promise<Login> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  const result = response.json<Login>();
  rememberTokenIp(result.token);
  return result;
}

async function registerDeveloper(): Promise<Login> {
  return registerAndVerifyDeveloper(`dev-${randomUUID()}@kodpauza.local`);
}

async function createVerifiedDeveloperDirect(): Promise<Login> {
  const email = `dev-direct-${randomUUID()}@kodpauza.local`;
  const eventSecret = createHash('sha256').update(randomUUID()).digest('hex');
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash('password123', config.passwordSaltRounds),
      role: 'developer',
      emailVerifiedAt: new Date(),
      developerProfile: {
        create: {
          installId: randomUUID(),
          eventSecret,
        },
      },
    },
  });
  const token = signToken({ id: user.id, email, role: 'developer' });
  rememberTokenIp(token);
  return { token, eventSecret, user: { id: user.id } };
}

async function registerAndVerifyDeveloper(email: string, password = 'password123'): Promise<Login> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password,
      role: 'developer',
      captchaToken: 'kodpauza-local-captcha-pass',
      ...legalRegistrationFields,
    },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({ verificationRequired: true });
  expect(response.body).not.toContain('token');
  const registeredUser = await prisma.user.findUniqueOrThrow({
    where: { email: email.toLowerCase() },
  });
  const acceptances = await prisma.legalAcceptance.findMany({
    where: { userId: registeredUser.id },
    orderBy: { documentType: 'asc' },
  });
  expect(acceptances).toHaveLength(3);
  expect(
    acceptances.map(({ documentType, documentVersion }) => ({ documentType, documentVersion })),
  ).toEqual(
    expect.arrayContaining([
      { documentType: 'terms', documentVersion: legalDocumentVersions.terms },
      { documentType: 'privacy', documentVersion: legalDocumentVersions.privacy },
      {
        documentType: 'personal_data_consent',
        documentVersion: legalDocumentVersions.personalDataConsent,
      },
    ]),
  );
  expect(acceptances.every((acceptance) => Boolean(acceptance.ipHash))).toBe(true);
  const normalizedEmail = email.toLowerCase();
  const code = verificationCodes.get(normalizedEmail);
  expect(code).toMatch(/^\d{6}$/);
  const verified = await app.inject({
    method: 'POST',
    url: '/v1/auth/verify-email',
    payload: { email: normalizedEmail, code },
  });
  expect(verified.statusCode).toBe(200);
  const result = verified.json<Login>();
  rememberTokenIp(result.token);
  return result;
}

async function nextAd(token: string): Promise<Ad> {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/ads/next?surface=codex_vscode',
    headers: auth(token),
  });
  expect(response.statusCode).toBe(200);
  const ad = response.json<Ad>();
  expect(ad.trackable).toBe(true);
  return ad;
}

function impression(
  ad: Pick<Ad, 'adId' | 'campaignId' | 'surface' | 'trackable' | 'format'>,
  visibleMs = 5200,
): SignableKodpauzaEvent & { visibleMs: number } {
  return {
    eventId: randomUUID(),
    adId: ad.adId,
    campaignId: ad.campaignId,
    surface: ad.surface,
    visibleMs,
    clientVersion: '0.1.0',
    toolName: 'codex',
    toolVersion: '0.1.0',
  };
}

function auth(token: string) {
  return {
    authorization: `Bearer ${token}`,
    'x-forwarded-for': tokenIps.get(token) ?? '198.51.100.250',
  };
}

function signedHeaders(
  token: string,
  secret: string,
  type: 'impression' | 'click',
  event: SignableKodpauzaEvent,
) {
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', secret)
    .update(eventSignaturePayload(type, event, timestamp))
    .digest('hex');
  return {
    ...auth(token),
    'x-kodpauza-timestamp': timestamp,
    'x-kodpauza-signature': `sha256=${signature}`,
  };
}

describe('kodpauza api', { timeout: 15_000 }, () => {
  beforeAll(async () => app.ready());

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('разделяет liveness и readiness', async () => {
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/ready')).json()).toMatchObject({ ok: true, status: 'ready' });
    const missing = await app.inject('/v1/unknown-route');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'Маршрут не найден.' });
  });

  it('подтверждает почту, нормализует email и не раскрывает секрет через /me', async () => {
    const email = `User-${randomUUID()}@Kodpauza.Local`;
    const body = await registerAndVerifyDeveloper(email);
    expect(body.eventSecret).toHaveLength(64);

    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: auth(body.token) });
    expect(me.statusCode).toBe(200);
    expect(me.body).not.toContain('eventSecret');
    expect(me.body).not.toContain('installId');
    expect(me.json().user.email).toBe(email.toLowerCase());
  });

  it('сохраняет долгоживущую сессию расширения, обновляет токен и отзывает ее при выходе', async () => {
    const email = `extension-${randomUUID()}@kodpauza.local`;
    const password = 'password123';
    await registerAndVerifyDeveloper(email, password);

    const loggedIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/login',
      payload: { email, password },
    });
    expect(loggedIn.statusCode).toBe(200);
    const session = loggedIn.json<ExtensionLogin>();
    expect(session.refreshToken).toMatch(/^kpr_[A-Za-z0-9_-]{43}$/);
    expect(session.eventSecret).toHaveLength(64);

    const stored = await prisma.extensionSession.findUniqueOrThrow({
      where: {
        tokenHash: createHash('sha256').update(session.refreshToken).digest('hex'),
      },
    });
    expect(stored.tokenHash).not.toContain(session.refreshToken);
    expect(stored.revokedAt).toBeNull();

    const refreshAttempts = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/extension/refresh',
        payload: { refreshToken: session.refreshToken },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/extension/refresh',
        payload: { refreshToken: session.refreshToken },
      }),
    ]);
    expect(refreshAttempts.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    const refreshed = refreshAttempts.find((response) => response.statusCode === 200)!;
    expect(refreshed.statusCode).toBe(200);
    const refreshedSession = refreshed.json<ExtensionLogin>();
    expect(refreshedSession.refreshToken).toMatch(/^kpr_[A-Za-z0-9_-]{43}$/);
    expect(refreshedSession.refreshToken).not.toBe(session.refreshToken);
    expect(refreshedSession.eventSecret).toBe(session.eventSecret);
    expect(
      await prisma.extensionSession.findUnique({
        where: { tokenHash: createHash('sha256').update(session.refreshToken).digest('hex') },
      }),
    ).toBeNull();

    const replayed = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(replayed.statusCode).toBe(401);

    const loggedOut = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/logout',
      payload: { refreshToken: refreshedSession.refreshToken },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect(
      (await prisma.extensionSession.findUniqueOrThrow({ where: { id: stored.id } })).revokedAt,
    ).not.toBeNull();

    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/refresh',
      payload: { refreshToken: refreshedSession.refreshToken },
    });
    expect(rejected.statusCode).toBe(401);

    const advertiser = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/login',
      payload: { email: 'adv@kodpauza.local', password: 'adv123456' },
    });
    expect(advertiser.statusCode).toBe(403);
  });

  it('не допускает публичного администратора и лишние поля контракта', async () => {
    const admin = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `admin-${randomUUID()}@kodpauza.local`,
        password: 'password123',
        role: 'admin',
        captchaToken: 'kodpauza-local-captcha-pass',
        ...legalRegistrationFields,
      },
    });
    const typo = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `dev-${randomUUID()}@kodpauza.local`,
        password: 'password123',
        role: 'developer',
        captchaToken: 'kodpauza-local-captcha-pass',
        ...legalRegistrationFields,
        name: 'Лишнее поле',
      },
    });
    expect(admin.statusCode).toBe(403);
    expect(typo.statusCode).toBe(400);
  });

  it('не регистрирует аккаунт без отдельных юридических согласий', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `no-consent-${randomUUID()}@kodpauza.local`,
        password: 'password123',
        role: 'developer',
        captchaToken: 'kodpauza-local-captcha-pass',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(verificationCodes.has(response.json<{ email?: string }>().email ?? '')).toBe(false);
  });

  it('дает пользователю экспорт данных и создает отслеживаемые privacy-заявки', async () => {
    const developer = await registerDeveloper();
    const exported = await app.inject({
      method: 'GET',
      url: '/v1/privacy/export',
      headers: auth(developer.token),
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('kodpauza-data-');
    expect(exported.json()).toMatchObject({
      formatVersion: '1.0',
      user: { id: developer.user.id, role: 'developer' },
    });
    expect(exported.body).not.toContain('passwordHash');
    expect(exported.body).not.toContain('ipHash');
    expect(exported.body).not.toContain('userAgentHash');

    const missingCorrection = await app.inject({
      method: 'POST',
      url: '/v1/privacy/requests',
      headers: auth(developer.token),
      payload: { type: 'correction' },
    });
    expect(missingCorrection.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/privacy/requests',
      headers: auth(developer.token),
      payload: { type: 'access' },
    });
    expect(created.statusCode).toBe(201);
    const requestId = created.json<{ request: { id: string } }>().request.id;

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/privacy/requests',
      headers: auth(developer.token),
      payload: { type: 'access' },
    });
    expect(duplicate.statusCode).toBe(409);

    const withdrawn = await app.inject({
      method: 'POST',
      url: '/v1/privacy/requests',
      headers: auth(developer.token),
      payload: { type: 'consent_withdrawal' },
    });
    expect(withdrawn.statusCode).toBe(201);
    expect(
      await prisma.legalAcceptance.count({
        where: {
          userId: developer.user.id,
          documentType: 'personal_data_consent',
          withdrawnAt: { not: null },
        },
      }),
    ).toBe(1);

    const admin = await login('admin@kodpauza.local', 'admin123456');
    const adminList = await app.inject({
      method: 'GET',
      url: '/v1/admin/privacy-requests',
      headers: auth(admin.token),
    });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json<{ requests: Array<{ id: string }> }>().requests).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: requestId })]),
    );

    const completed = await app.inject({
      method: 'POST',
      url: `/v1/admin/privacy-requests/${requestId}/status`,
      headers: auth(admin.token),
      payload: { status: 'completed', resolution: 'Экспорт предоставлен пользователю.' },
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ request: { status: 'completed' } });
    expect(
      await prisma.adminAuditLog.count({
        where: { targetType: 'privacy-request', targetId: requestId },
      }),
    ).toBe(1);
  });

  it('требует CAPTCHA, блокирует временную почту и не пускает до ввода кода', async () => {
    const password = 'password123';
    const email = `pending-${randomUUID()}@kodpauza.local`;
    const noCaptcha = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: `captcha-${randomUUID()}@kodpauza.local`,
        password,
        role: 'developer',
        captchaToken: 'invalid-captcha-token',
        ...legalRegistrationFields,
      },
    });
    const disposableResponses = await Promise.all(
      ['mailinator.com', 'trashlify.com', 'subdomain.trashlify.com'].map((domain) =>
        app.inject({
          method: 'POST',
          url: '/v1/auth/register',
          payload: {
            email: `temporary-${randomUUID()}@${domain}`,
            password,
            role: 'developer',
            captchaToken: 'kodpauza-local-captcha-pass',
            ...legalRegistrationFields,
          },
        }),
      ),
    );
    expect(noCaptcha.statusCode).toBe(400);
    expect(noCaptcha.json()).toMatchObject({ code: 'CAPTCHA_FAILED' });
    for (const disposable of disposableResponses) {
      expect(disposable.statusCode).toBe(400);
      expect(disposable.json()).toMatchObject({ code: 'DISPOSABLE_EMAIL' });
    }
    const [blockedVerification, blockedResend] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/verify-email',
        payload: { email: 'runtime-check@trashlify.com', code: '123456' },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/resend-verification',
        payload: { email: 'runtime-check@trashlify.com' },
      }),
    ]);
    for (const response of [blockedVerification, blockedResend]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'DISPOSABLE_EMAIL' });
    }

    const registered = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email,
        password,
        role: 'developer',
        captchaToken: 'kodpauza-local-captcha-pass',
        ...legalRegistrationFields,
      },
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toMatchObject({
      email,
      verificationRequired: true,
    });
    expect(registered.body).not.toContain('token');
    expect(registered.body).not.toContain('eventSecret');

    const blockedWeb = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    const blockedExtension = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/login',
      payload: { email, password },
    });
    expect(blockedWeb.statusCode).toBe(403);
    expect(blockedWeb.json()).toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      verificationRequired: true,
    });
    expect(blockedExtension.statusCode).toBe(403);

    const code = verificationCodes.get(email);
    const wrongCode = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { email, code: code === '000000' ? '999999' : '000000' },
    });
    const earlyResend = await app.inject({
      method: 'POST',
      url: '/v1/auth/resend-verification',
      payload: { email },
    });
    expect(wrongCode.statusCode).toBe(400);
    expect(earlyResend.statusCode).toBe(429);
    expect(earlyResend.headers['retry-after']).toBeTruthy();

    const verified = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { email, code },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({ verified: true, user: { emailVerified: true } });
    expect(verified.json().token).toBeTruthy();
  });

  it('закрывает вход и старые сессии ранее подтвержденного аккаунта с временной почтой', async () => {
    const password = 'password123';
    const email = `legacy-${randomUUID()}@trashlify.com`;
    const legacyUser = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, config.passwordSaltRounds),
        role: 'developer',
        emailVerifiedAt: new Date(),
        developerProfile: {
          create: {
            installId: randomUUID(),
            eventSecret: createHash('sha256').update(randomUUID()).digest('hex'),
          },
        },
      },
    });
    const token = signToken({ id: legacyUser.id, email, role: 'developer' });
    const refreshToken = `kpr_${createHash('sha256').update(randomUUID()).digest('base64url')}`;
    await prisma.extensionSession.create({
      data: {
        userId: legacyUser.id,
        tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/extension/login',
        payload: { email, password },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/auth/extension/refresh',
        payload: { refreshToken },
      }),
      app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: auth(token),
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'DISPOSABLE_EMAIL' });
    }
  });

  it('ограничивает частоту регистрации для одного IP', async () => {
    const originalLimit = config.rateLimitRegister;
    config.rateLimitRegister = 2;
    try {
      const request = {
        method: 'POST' as const,
        url: '/v1/auth/register',
        headers: { 'x-forwarded-for': '203.0.113.210' },
        payload: {},
      };
      expect((await app.inject(request)).statusCode).toBe(400);
      expect((await app.inject(request)).statusCode).toBe(400);
      const limited = await app.inject(request);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeTruthy();
    } finally {
      config.rateLimitRegister = originalLimit;
    }
  });

  it('не доверяет подложному IP в цепочке reverse proxy', async () => {
    const originalLimit = config.rateLimitRegister;
    config.rateLimitRegister = 2;
    try {
      const request = (forwardedFor: string) => ({
        method: 'POST' as const,
        url: '/v1/auth/register',
        headers: { 'x-forwarded-for': forwardedFor },
        payload: {},
      });

      expect((await app.inject(request('198.51.100.10, 203.0.113.220'))).statusCode).toBe(400);
      expect((await app.inject(request('198.51.100.11, 203.0.113.220'))).statusCode).toBe(400);
      expect((await app.inject(request('198.51.100.12, 203.0.113.220'))).statusCode).toBe(429);
      expect((await app.inject(request('198.51.100.12, 203.0.113.221'))).statusCode).toBe(400);
    } finally {
      config.rateLimitRegister = originalLimit;
    }
  });

  it('не отражает запрещенный Origin в CORS', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/login',
      headers: { origin: 'https://attacker.example' },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('выдает рекламу только разработчику и связывает ее с одноразовым adId', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    expect(ad.adId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ad.format).toBe('standard');
    expect(await prisma.adServe.findUnique({ where: { adId: ad.adId } })).toMatchObject({
      userId: developer.user.id,
      campaignId: ad.campaignId,
    });

    const claudeAd = await app.inject({
      method: 'GET',
      url: '/v1/ads/next?surface=claude_code_vscode',
      headers: auth(developer.token),
    });
    expect(claudeAd.statusCode).toBe(200);
    expect(claudeAd.json()).toMatchObject({ surface: 'claude_code_vscode', trackable: true });

    const removedDemoSurface = await app.inject({
      method: 'GET',
      url: '/v1/ads/next?surface=demo_adapter',
      headers: auth(developer.token),
    });
    expect(removedDemoSurface.statusCode).toBe(400);

    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/ads/next?surface=codex_vscode',
      headers: auth(advertiser.token),
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('возвращает ERID отдельным полем и маркирует URL рекламной выдачи', async () => {
    const developer = await login('dev@kodpauza.local', 'dev123456');
    const advertiserLogin = await login('adv@kodpauza.local', 'adv123456');
    const advertiser = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiserLogin.user.id },
    });
    const activeCampaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    const originalUrl = 'https://kodpauza.ru/install?utm_source=vscode#start';
    const erid = 'creative-route-token-123';
    const legacyErid = 'legacy-route-token-123';
    let campaignId: string | undefined;

    try {
      await prisma.campaign.updateMany({
        where: { id: { in: activeCampaigns.map((campaign) => campaign.id) } },
        data: { status: 'paused' },
      });
      const campaign = await prisma.campaign.create({
        data: {
          advertiserId: advertiser.id,
          name: 'Проверка ERID в рекламной выдаче',
          text: 'Установите Kodpauza для разработки',
          url: originalUrl,
          erid: legacyErid,
          status: 'active',
          cpmKopecks: 30_000,
          billableCpmKopecks: 30_000,
          budgetKopecks: 100_000,
          surfaces: {
            create: {
              surface: 'codex_vscode',
              cpmKopecks: 30_000,
              billableCpmKopecks: 30_000,
            },
          },
          creatives: {
            create: {
              label: 'Основной',
              text: 'Установите Kodpauza для разработки',
              url: originalUrl,
              erid,
            },
          },
        },
      });
      campaignId = campaign.id;

      const markedResponse = await app.inject({
        method: 'GET',
        url: '/v1/ads/next?surface=codex_vscode',
        headers: auth(developer.token),
      });
      expect(markedResponse.statusCode).toBe(200);
      expect(markedResponse.json()).toMatchObject({
        campaignId,
        erid,
        url: 'https://kodpauza.ru/install?utm_source=vscode&erid=creative-route-token-123#start',
      });

      await prisma.campaignCreative.updateMany({
        where: { campaignId },
        data: { erid: null },
      });
      const legacyResponse = await app.inject({
        method: 'GET',
        url: '/v1/ads/next?surface=codex_vscode',
        headers: auth(developer.token),
      });
      expect(legacyResponse.statusCode).toBe(200);
      expect(legacyResponse.json()).toMatchObject({
        campaignId,
        erid: legacyErid,
        url: 'https://kodpauza.ru/install?utm_source=vscode&erid=legacy-route-token-123#start',
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { erid: null },
      });
      const unmarkedResponse = await app.inject({
        method: 'GET',
        url: '/v1/ads/next?surface=codex_vscode',
        headers: auth(developer.token),
      });
      expect(unmarkedResponse.statusCode).toBe(200);
      expect(unmarkedResponse.json()).toMatchObject({
        campaignId,
        erid: null,
        url: originalUrl,
      });
    } finally {
      if (campaignId) {
        await prisma.adServe.deleteMany({ where: { campaignId } });
        await prisma.campaign.delete({ where: { id: campaignId } });
      }
      await prisma.campaign.updateMany({
        where: { id: { in: activeCampaigns.map((campaign) => campaign.id) } },
        data: { status: 'active' },
      });
    }
  });

  it('учитывает авторизованную установку расширения и строит воронку беты', async () => {
    const developer = await registerDeveloper();
    const anotherDeveloper = await registerDeveloper();
    const installId = randomUUID();
    const heartbeat = {
      installId,
      vscodeVersion: '1.102.0',
      extensionVersion: '0.7.5',
      os: 'darwin',
      integrationsEnabled: true,
      codexDetected: true,
      claudeDetected: false,
    };
    const created = await app.inject({
      method: 'PUT',
      url: '/v1/developer/extension-install',
      headers: auth(developer.token),
      payload: heartbeat,
    });
    expect(created.statusCode).toBe(204);
    expect(await prisma.extensionInstall.findUnique({ where: { installId } })).toMatchObject({
      userId: developer.user.id,
      integrationsEnabled: true,
      codexDetected: true,
    });

    const erroredHeartbeat = await app.inject({
      method: 'PUT',
      url: '/v1/developer/extension-install',
      headers: auth(developer.token),
      payload: {
        ...heartbeat,
        heartbeatSchemaVersion: 2,
        codexPatchStatus: 'error',
        codexPatchErrorCategory: 'permission',
      },
    });
    expect(erroredHeartbeat.statusCode).toBe(204);
    expect(await prisma.extensionInstall.findUnique({ where: { installId } })).toMatchObject({
      codexPatchStatus: 'error',
      codexPatchErrorCategory: 'permission',
    });

    const recoveredHeartbeat = await app.inject({
      method: 'PUT',
      url: '/v1/developer/extension-install',
      headers: auth(developer.token),
      payload: {
        ...heartbeat,
        heartbeatSchemaVersion: 2,
        codexPatchStatus: 'installed_exact',
      },
    });
    expect(recoveredHeartbeat.statusCode).toBe(204);
    expect(await prisma.extensionInstall.findUnique({ where: { installId } })).toMatchObject({
      codexPatchStatus: 'installed_exact',
      codexPatchErrorCategory: null,
    });

    const stolen = await app.inject({
      method: 'PUT',
      url: '/v1/developer/extension-install',
      headers: auth(anotherDeveloper.token),
      payload: heartbeat,
    });
    expect(stolen.statusCode).toBe(409);

    const admin = await login('admin@kodpauza.local', 'admin123456');
    const funnel = await app.inject({
      method: 'GET',
      url: '/v1/admin/funnel',
      headers: auth(admin.token),
    });
    expect(funnel.statusCode).toBe(200);
    expect(funnel.json().stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'extension_authenticated', value: expect.any(Number) }),
        expect.objectContaining({ id: 'integration_enabled', value: expect.any(Number) }),
      ]),
    );
    expect(funnel.json().days).toHaveLength(14);
  });

  it('не подменяет отсутствие подходящей кампании тестовым объявлением', async () => {
    const developer = await registerDeveloper();
    const activeCampaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    try {
      await prisma.campaign.updateMany({
        where: { id: { in: activeCampaigns.map((campaign) => campaign.id) } },
        data: { status: 'paused' },
      });
      const response = await app.inject({
        method: 'GET',
        url: '/v1/ads/next?surface=codex_vscode',
        headers: auth(developer.token),
      });
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    } finally {
      await prisma.campaign.updateMany({
        where: { id: { in: activeCampaigns.map((campaign) => campaign.id) } },
        data: { status: 'active' },
      });
    }
  });

  it('атомарно списывает полную цену, начисляет долю и пишет две проводки', async () => {
    const developer = await registerDeveloper();
    const secret = developer.eventSecret!;
    const ad = await nextAd(developer.token);
    const payload = impression(ad);
    const campaignBefore = await prisma.campaign.findUniqueOrThrow({
      where: { id: ad.campaignId },
    });
    const advertiserBefore = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { id: campaignBefore.advertiserId },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, secret, 'impression', payload),
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ rewardKopecks: 15, fraudStatus: 'clean' });

    const campaignAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: ad.campaignId } });
    const advertiserAfter = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { id: campaignBefore.advertiserId },
    });
    const event = await prisma.adEvent.findUniqueOrThrow({ where: { eventId: payload.eventId } });
    const entries = await prisma.ledgerEntry.findMany({ where: { eventId: event.id } });
    expect(campaignAfter.spentKopecks - campaignBefore.spentKopecks).toBe(30);
    expect(advertiserBefore.balanceKopecks - advertiserAfter.balanceKopecks).toBe(30);
    expect(entries.map((entry) => entry.amountKopecks).sort((a, b) => a - b)).toEqual([-30, 15]);

    const admin = await login('admin@kodpauza.local', 'admin123456');
    const adminEvents = await app.inject({
      method: 'GET',
      url: '/v1/admin/events?page=1&pageSize=5',
      headers: auth(admin.token),
    });
    expect(adminEvents.statusCode).toBe(200);
    expect(adminEvents.json()).toMatchObject({
      pagination: {
        page: 1,
        pageSize: 5,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      },
    });
    expect(adminEvents.body).not.toContain('ipHash');
    expect(adminEvents.body).not.toContain('userAgentHash');

    const invalidAdminPage = await app.inject({
      method: 'GET',
      url: '/v1/admin/events?page=0&pageSize=5',
      headers: auth(admin.token),
    });
    expect(invalidAdminPage.statusCode).toBe(400);
  });

  it('переносит дробные копейки CPM и доли разработчика между показами', async () => {
    const developer = await registerDeveloper();
    const advertiserLogin = await login('adv@kodpauza.local', 'adv123456');
    const advertiser = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiserLogin.user.id },
    });
    await prisma.developerProfile.update({
      where: { userId: developer.user.id },
      data: { rewardRemainderUnits: 9_995_000 },
    });
    const campaign = await prisma.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: 'Точная дробная кампания',
        text: 'Точная проверка дробных начислений',
        url: 'https://example.ru/fractional',
        status: 'active',
        cpmKopecks: 2_001,
        billableCpmKopecks: 2_001,
        budgetKopecks: 100_000,
        billingRemainderMilliKopecks: 999,
        surfaces: {
          create: { surface: 'codex_vscode', cpmKopecks: 2_001, billableCpmKopecks: 2_001 },
        },
        creatives: {
          create: {
            label: 'Основной',
            text: 'Точная проверка дробных начислений',
            url: 'https://example.ru/fractional',
          },
        },
      },
      include: { creatives: true },
    });
    const adId = randomUUID();
    await prisma.adServe.create({
      data: {
        adId,
        userId: developer.user.id,
        campaignId: campaign.id,
        creativeId: campaign.creatives[0]!.id,
        surface: 'codex_vscode',
        cpmKopecks: campaign.cpmKopecks,
        billableCpmKopecks: campaign.billableCpmKopecks,
        format: campaign.format,
        costKopecks: 0,
        rewardKopecks: 0,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const payload = impression({
      adId,
      campaignId: campaign.id,
      surface: 'codex_vscode',
      trackable: true,
      format: 'standard',
    });
    const headers = signedHeaders(developer.token, developer.eventSecret!, 'impression', payload);

    const first = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers,
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ rewardKopecks: 2, duplicate: false });

    const [campaignAfter, developerAfter, serveAfter, event] = await Promise.all([
      prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
      prisma.developerProfile.findUniqueOrThrow({ where: { userId: developer.user.id } }),
      prisma.adServe.findUniqueOrThrow({ where: { adId } }),
      prisma.adEvent.findUniqueOrThrow({ where: { eventId: payload.eventId } }),
    ]);
    expect(campaignAfter).toMatchObject({
      spentKopecks: 3,
      billingRemainderMilliKopecks: 0,
      impressionsServed: 1,
    });
    expect(developerAfter).toMatchObject({
      balanceKopecks: 2,
      rewardRemainderUnits: 0,
      totalImpressions: 1,
    });
    expect(serveAfter).toMatchObject({ costKopecks: 3, rewardKopecks: 2 });
    expect(
      (await prisma.ledgerEntry.findMany({ where: { eventId: event.id } }))
        .map((entry) => entry.amountKopecks)
        .sort((a, b) => a - b),
    ).toEqual([-3, 2]);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers,
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ rewardKopecks: 2, duplicate: true });
    expect(await prisma.ledgerEntry.count({ where: { eventId: event.id } })).toBe(2);
  });

  it('откатывает событие, остатки и выдачу, если списание рекламодателя не прошло', async () => {
    const developer = await registerDeveloper();
    const advertiserUser = await prisma.user.create({
      data: {
        email: `rollback-${randomUUID()}@kodpauza.local`,
        passwordHash: await bcrypt.hash('password123', 4),
        role: 'advertiser',
        emailVerifiedAt: new Date(),
        advertiserProfile: {
          create: {
            companyName: 'Rollback advertiser',
            publicName: 'Rollback brand',
            balanceKopecks: 2,
          },
        },
      },
      include: { advertiserProfile: true },
    });
    const advertiser = advertiserUser.advertiserProfile!;
    const campaign = await prisma.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: 'Кампания проверки отката',
        text: 'Проверка полного транзакционного отката',
        url: 'https://example.ru/rollback',
        status: 'active',
        cpmKopecks: 2_001,
        billableCpmKopecks: 2_001,
        budgetKopecks: 100_000,
        billingRemainderMilliKopecks: 999,
        surfaces: {
          create: { surface: 'codex_vscode', cpmKopecks: 2_001, billableCpmKopecks: 2_001 },
        },
        creatives: {
          create: {
            label: 'Основной',
            text: 'Проверка полного транзакционного отката',
            url: 'https://example.ru/rollback',
          },
        },
      },
      include: { creatives: true },
    });
    const adId = randomUUID();
    await prisma.adServe.create({
      data: {
        adId,
        userId: developer.user.id,
        campaignId: campaign.id,
        creativeId: campaign.creatives[0]!.id,
        surface: 'codex_vscode',
        cpmKopecks: campaign.cpmKopecks,
        billableCpmKopecks: campaign.billableCpmKopecks,
        format: campaign.format,
        costKopecks: 0,
        rewardKopecks: 0,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const payload = impression({
      adId,
      campaignId: campaign.id,
      surface: 'codex_vscode',
      trackable: true,
      format: 'standard',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', payload),
      payload,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'На балансе рекламодателя недостаточно средств.',
    });

    const [campaignAfter, developerAfter, advertiserAfter, serveAfter] = await Promise.all([
      prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } }),
      prisma.developerProfile.findUniqueOrThrow({ where: { userId: developer.user.id } }),
      prisma.advertiserProfile.findUniqueOrThrow({ where: { id: advertiser.id } }),
      prisma.adServe.findUniqueOrThrow({ where: { adId } }),
    ]);
    expect(campaignAfter).toMatchObject({
      spentKopecks: 0,
      impressionsServed: 0,
      billingRemainderMilliKopecks: 999,
    });
    expect(developerAfter).toMatchObject({
      balanceKopecks: 0,
      totalImpressions: 0,
      rewardRemainderUnits: 0,
    });
    expect(advertiserAfter.balanceKopecks).toBe(2);
    expect(serveAfter).toMatchObject({
      costKopecks: 0,
      rewardKopecks: 0,
      impressionRecordedAt: null,
    });
    expect(await prisma.adEvent.count({ where: { eventId: payload.eventId } })).toBe(0);
  });

  it('не начисляет двум разработчикам с общего IP одновременно', async () => {
    const owner = await registerDeveloper();
    const contender = await registerDeveloper();
    const sharedIp = '203.0.113.200';
    rememberTokenIp(owner.token, sharedIp);
    rememberTokenIp(contender.token, sharedIp);

    const ownerAd = await nextAd(owner.token);
    const contenderAd = await nextAd(contender.token);
    const ownerEvent = impression(ownerAd);
    const contenderEvent = impression(contenderAd);
    const advertiserBefore = await prisma.advertiserProfile.findFirstOrThrow({
      where: { campaigns: { some: { id: ownerAd.campaignId } } },
    });

    const [ownerResponse, contenderResponse] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/events/impression',
        headers: signedHeaders(owner.token, owner.eventSecret!, 'impression', ownerEvent),
        payload: ownerEvent,
      }),
      app.inject({
        method: 'POST',
        url: '/v1/events/impression',
        headers: signedHeaders(
          contender.token,
          contender.eventSecret!,
          'impression',
          contenderEvent,
        ),
        payload: contenderEvent,
      }),
    ]);
    const responses = [ownerResponse, contenderResponse];
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    expect(responses.map((response) => response.json().rewardKopecks).sort()).toEqual([0, 15]);

    const winner = ownerResponse.json().rewardKopecks === 15 ? owner : contender;
    const blocked = winner.user.id === owner.user.id ? contender : owner;
    const blockedEvent = blocked.user.id === owner.user.id ? ownerEvent : contenderEvent;
    const profiles = await prisma.developerProfile.findMany({
      where: { userId: { in: [owner.user.id, contender.user.id] } },
    });
    const advertiserAfter = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { id: advertiserBefore.id },
    });
    const flag = await prisma.fraudFlag.findFirstOrThrow({
      where: { event: { eventId: blockedEvent.eventId } },
    });
    expect(profiles.reduce((total, profile) => total + profile.balanceKopecks, 0)).toBe(15);
    expect(advertiserBefore.balanceKopecks - advertiserAfter.balanceKopecks).toBe(30);
    expect(flag.reason).toContain('concurrent_shared_ip_income');
    expect(flag.metadata).toMatchObject({ conflictingUserId: winner.user.id });

    await prisma.adEvent.updateMany({
      where: { eventId: { in: [ownerEvent.eventId, contenderEvent.eventId] } },
      data: { createdAt: new Date(Date.now() - 11_000) },
    });

    const laterAd = await nextAd(blocked.token);
    const laterEvent = impression(laterAd);
    const laterResponse = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(blocked.token, blocked.eventSecret!, 'impression', laterEvent),
      payload: laterEvent,
    });
    expect(laterResponse.statusCode).toBe(201);
    expect(laterResponse.json()).toMatchObject({ fraudStatus: 'clean' });
    expect(laterResponse.json().rewardKopecks).toBeGreaterThan(0);
  });

  it('идемпотентно подтверждает сетевой повтор и не начисляет дважды', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const payload = impression(ad);
    const headers = signedHeaders(developer.token, developer.eventSecret!, 'impression', payload);

    const first = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers,
      payload,
    });
    const balanceAfterFirst = await prisma.developerProfile.findUniqueOrThrow({
      where: { userId: developer.user.id },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers,
      payload,
    });
    const balanceAfterDuplicate = await prisma.developerProfile.findUniqueOrThrow({
      where: { userId: developer.user.id },
    });

    expect(first.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ duplicate: true, eventId: payload.eventId });
    expect(balanceAfterDuplicate.balanceKopecks).toBe(balanceAfterFirst.balanceKopecks);
  });

  it('отклоняет подмену payload при том же eventId', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const payload = impression(ad);
    await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', payload),
      payload,
    });
    const changed = { ...payload, visibleMs: 6200 };
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', changed),
      payload: changed,
    });
    expect(response.statusCode).toBe(409);
  });

  it('не принимает событие без выдачи, подписи или пяти секунд видимости', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const short = impression(ad, 3000);
    const shortResponse = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', short),
      payload: short,
    });
    const unsignedPayload = impression(await nextAd(developer.token));
    const unsigned = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: auth(developer.token),
      payload: unsignedPayload,
    });
    const forged = impression({ ...ad, adId: randomUUID() });
    const noServe = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', forged),
      payload: forged,
    });
    expect(shortResponse.statusCode).toBe(422);
    expect(unsigned.statusCode).toBe(401);
    expect(noServe.statusCode).toBe(404);
  });

  it('останавливает платную выдачу на суточной квоте без FraudFlag', async () => {
    const developer = await createVerifiedDeveloperDirect();
    const ad = await nextAd(developer.token);
    const quotaEventAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    await prisma.adEvent.createMany({
      data: Array.from({ length: 300 }, () => ({
        eventId: randomUUID(),
        userId: developer.user.id,
        campaignId: ad.campaignId,
        creativeId: ad.creativeId,
        adId: randomUUID(),
        type: 'impression' as const,
        surface: ad.surface,
        visibleMs: 5_200,
        rewardKopecks: 0,
        clientVersion: '0.1.0',
        toolName: 'codex',
        toolVersion: '0.1.0',
        fraudStatus: 'clean' as const,
        createdAt: quotaEventAt,
      })),
    });

    const servesBefore = await prisma.adServe.count({ where: { userId: developer.user.id } });
    const capped = await app.inject({
      method: 'GET',
      url: '/v1/ads/next?surface=codex_vscode',
      headers: auth(developer.token),
    });
    expect(capped.statusCode).toBe(204);
    expect(capped.headers['x-kodpauza-quota-tier']).toBe('starter');
    expect(capped.headers['x-kodpauza-quota-day-used']).toBe('300');
    expect(capped.headers['x-kodpauza-quota-day-limit']).toBe('300');
    expect(await prisma.adServe.count({ where: { userId: developer.user.id } })).toBe(servesBefore);

    const payload = impression(ad);
    const lateConfirmation = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', payload),
      payload,
    });
    expect(lateConfirmation.statusCode).toBe(409);
    expect(lateConfirmation.json()).toMatchObject({
      reasons: ['rolling_day_quota_exhausted'],
    });
    expect(await prisma.adEvent.findUnique({ where: { eventId: payload.eventId } })).toBeNull();
    expect(await prisma.fraudFlag.count({ where: { userId: developer.user.id } })).toBe(0);

    const balance = await app.inject({
      method: 'GET',
      url: '/v1/developer/balance',
      headers: auth(developer.token),
    });
    expect(balance.statusCode).toBe(200);
    expect(balance.json()).toMatchObject({
      quota: {
        tier: 'starter',
        rollingDay: { used: 300, limit: 300, remaining: 0 },
        capped: true,
        exhausted: 'rolling_day',
      },
    });
  });

  it('не снижает уровень из-за старого quota-сигнала, ошибочно записанного как fraud', async () => {
    const developer = await createVerifiedDeveloperDirect();
    await Promise.all([
      prisma.user.update({
        where: { id: developer.user.id },
        data: { createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1_000) },
      }),
      prisma.developerProfile.update({
        where: { userId: developer.user.id },
        data: { totalImpressions: 500 },
      }),
    ]);
    const ad = await nextAd(developer.token);
    const legacyEvent = await prisma.adEvent.create({
      data: {
        eventId: randomUUID(),
        userId: developer.user.id,
        campaignId: ad.campaignId,
        creativeId: ad.creativeId,
        adId: randomUUID(),
        type: 'impression',
        surface: ad.surface,
        visibleMs: 5_200,
        rewardKopecks: 0,
        clientVersion: '0.1.0',
        toolName: 'codex',
        toolVersion: '0.1.0',
        fraudStatus: 'suspicious',
      },
    });
    await prisma.fraudFlag.create({
      data: {
        userId: developer.user.id,
        eventId: legacyEvent.id,
        reason: 'hour_limit_exceeded,day_limit_exceeded',
        severity: 'medium',
      },
    });

    const balance = await app.inject({
      method: 'GET',
      url: '/v1/developer/balance',
      headers: auth(developer.token),
    });
    expect(balance.statusCode).toBe(200);
    expect(balance.json()).toMatchObject({
      quota: {
        tier: 'trusted',
        rollingDay: { limit: 450 },
      },
    });
  });

  it('не оплачивает подозрительный показ и создает сигнал', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const payload = impression(ad, 60_001);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', payload),
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ fraudStatus: 'suspicious', rewardKopecks: 0 });
    expect(await prisma.fraudFlag.count({ where: { event: { eventId: payload.eventId } } })).toBe(
      1,
    );
  });

  it('не считает чистым клик после подозрительного показа', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const suspiciousPayload = impression(ad, 60_001);
    const suspicious = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(
        developer.token,
        developer.eventSecret!,
        'impression',
        suspiciousPayload,
      ),
      payload: suspiciousPayload,
    });
    expect(suspicious.statusCode).toBe(201);
    expect(suspicious.json()).toMatchObject({ fraudStatus: 'suspicious' });

    const serve = await prisma.adServe.findUniqueOrThrow({ where: { adId: ad.adId } });
    const [campaignBefore, creativeBefore, surfaceBefore, developerBefore] = await Promise.all([
      prisma.campaign.findUniqueOrThrow({ where: { id: ad.campaignId } }),
      prisma.campaignCreative.findUniqueOrThrow({ where: { id: serve.creativeId } }),
      prisma.campaignSurface.findUniqueOrThrow({
        where: { campaignId_surface: { campaignId: ad.campaignId, surface: ad.surface } },
      }),
      prisma.developerProfile.findUniqueOrThrow({ where: { userId: developer.user.id } }),
    ]);
    const clickPayload = { ...impression(ad), visibleMs: undefined };
    delete clickPayload.visibleMs;
    const click = await app.inject({
      method: 'POST',
      url: '/v1/events/click',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'click', clickPayload),
      payload: clickPayload,
    });

    expect(click.statusCode).toBe(201);
    expect(click.json()).toMatchObject({ fraudStatus: 'suspicious' });
    const [campaignAfter, creativeAfter, surfaceAfter, developerAfter, clickEvent] =
      await Promise.all([
        prisma.campaign.findUniqueOrThrow({ where: { id: ad.campaignId } }),
        prisma.campaignCreative.findUniqueOrThrow({ where: { id: serve.creativeId } }),
        prisma.campaignSurface.findUniqueOrThrow({
          where: { campaignId_surface: { campaignId: ad.campaignId, surface: ad.surface } },
        }),
        prisma.developerProfile.findUniqueOrThrow({ where: { userId: developer.user.id } }),
        prisma.adEvent.findUniqueOrThrow({ where: { eventId: clickPayload.eventId } }),
      ]);
    expect(campaignAfter.clicks).toBe(campaignBefore.clicks);
    expect(creativeAfter.clicks).toBe(creativeBefore.clicks);
    expect(surfaceAfter.clicks).toBe(surfaceBefore.clicks);
    expect(developerAfter.totalClicks).toBe(developerBefore.totalClicks);
    expect(await prisma.fraudFlag.count({ where: { eventId: clickEvent.id } })).toBe(1);
  });

  it('не дает одному разработчику автоматически остановить кампанию suspicious-событиями', async () => {
    const developer = await registerDeveloper();
    const advertiserLogin = await login('adv@kodpauza.local', 'adv123456');
    const advertiser = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiserLogin.user.id },
    });
    const activeCampaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    await prisma.campaign.updateMany({
      where: { id: { in: activeCampaigns.map((campaign) => campaign.id) } },
      data: { status: 'paused' },
    });
    const campaign = await prisma.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: 'Защита кампании от одного источника',
        text: 'Один источник не останавливает кампанию',
        url: 'https://example.ru/anomaly-source',
        status: 'active',
        cpmKopecks: 30_000,
        billableCpmKopecks: 30_000,
        budgetKopecks: 100_000,
        surfaces: {
          create: {
            surface: 'codex_vscode',
            cpmKopecks: 30_000,
            billableCpmKopecks: 30_000,
          },
        },
        creatives: {
          create: {
            label: 'Основной',
            text: 'Один источник не останавливает кампанию',
            url: 'https://example.ru/anomaly-source',
          },
        },
      },
      include: { creatives: true },
    });

    try {
      await prisma.adEvent.createMany({
        data: Array.from({ length: 20 }, () => ({
          eventId: randomUUID(),
          userId: developer.user.id,
          campaignId: campaign.id,
          creativeId: campaign.creatives[0]!.id,
          adId: randomUUID(),
          type: 'impression' as const,
          surface: 'codex_vscode' as const,
          visibleMs: 60_001,
          rewardKopecks: 0,
          clientVersion: '0.1.0',
          toolName: 'codex',
          toolVersion: '0.1.0',
          fraudStatus: 'suspicious' as const,
        })),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/ads/next?surface=codex_vscode',
        headers: auth(developer.token),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ campaignId: campaign.id });
      expect(await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject(
        { status: 'active', autoPausedAt: null, pauseReason: null },
      );
    } finally {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } });
      await prisma.campaign.updateMany({
        where: { id: { in: activeCampaigns.map((item) => item.id) } },
        data: { status: 'active' },
      });
    }
  });

  it('не расходует частотный лимит подозрительным показом', async () => {
    const developer = await registerDeveloper();
    const advertiserLogin = await login('adv@kodpauza.local', 'adv123456');
    const advertiser = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiserLogin.user.id },
    });
    const activeCampaigns = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    await prisma.campaign.updateMany({
      where: { id: { in: activeCampaigns.map((campaign) => campaign.id) } },
      data: { status: 'paused' },
    });
    const campaign = await prisma.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: 'Частотный лимит и антифрод',
        text: 'Проверка частотного лимита чистых показов',
        url: 'https://example.ru/frequency',
        status: 'active',
        cpmKopecks: 30_000,
        billableCpmKopecks: 30_000,
        budgetKopecks: 100_000,
        frequencyCapPerDay: 1,
        surfaces: {
          create: {
            surface: 'codex_vscode',
            cpmKopecks: 30_000,
            billableCpmKopecks: 30_000,
          },
        },
        creatives: {
          create: {
            label: 'Основной',
            text: 'Проверка частотного лимита чистых показов',
            url: 'https://example.ru/frequency',
          },
        },
      },
    });

    try {
      const suspiciousAd = await nextAd(developer.token);
      expect(suspiciousAd.campaignId).toBe(campaign.id);
      const suspiciousPayload = impression(suspiciousAd, 60_001);
      const suspicious = await app.inject({
        method: 'POST',
        url: '/v1/events/impression',
        headers: signedHeaders(
          developer.token,
          developer.eventSecret!,
          'impression',
          suspiciousPayload,
        ),
        payload: suspiciousPayload,
      });
      expect(suspicious.statusCode).toBe(201);
      expect(suspicious.json()).toMatchObject({ fraudStatus: 'suspicious' });
      await prisma.adEvent.update({
        where: { eventId: suspiciousPayload.eventId },
        data: { createdAt: new Date(Date.now() - 11_000) },
      });

      const cleanAd = await nextAd(developer.token);
      expect(cleanAd.campaignId).toBe(campaign.id);
      const cleanPayload = impression(cleanAd);
      const clean = await app.inject({
        method: 'POST',
        url: '/v1/events/impression',
        headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', cleanPayload),
        payload: cleanPayload,
      });
      expect(clean.statusCode).toBe(201);
      expect(clean.json()).toMatchObject({ fraudStatus: 'clean' });

      const capped = await app.inject({
        method: 'GET',
        url: '/v1/ads/next?surface=codex_vscode',
        headers: auth(developer.token),
      });
      expect(capped.statusCode).toBe(204);
    } finally {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } });
      await prisma.campaign.updateMany({
        where: { id: { in: activeCampaigns.map((item) => item.id) } },
        data: { status: 'active' },
      });
    }
  });

  it('учитывает только один чистый клик на одну выдачу', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const payload = { ...impression(ad), visibleMs: undefined };
    delete payload.visibleMs;
    const headers = signedHeaders(developer.token, developer.eventSecret!, 'click', payload);
    const beforeImpression = await app.inject({
      method: 'POST',
      url: '/v1/events/click',
      headers,
      payload,
    });
    expect(beforeImpression.statusCode).toBe(409);
    expect(beforeImpression.json()).toMatchObject({
      error: 'Сначала должен быть подтвержден показ объявления.',
    });

    const impressionPayload = impression(ad);
    const recordedImpression = await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(
        developer.token,
        developer.eventSecret!,
        'impression',
        impressionPayload,
      ),
      payload: impressionPayload,
    });
    expect(recordedImpression.statusCode).toBe(201);

    const first = await app.inject({ method: 'POST', url: '/v1/events/click', headers, payload });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/events/click',
      headers,
      payload,
    });
    const secondPayload = { ...payload, eventId: randomUUID() };
    const second = await app.inject({
      method: 'POST',
      url: '/v1/events/click',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'click', secondPayload),
      payload: secondPayload,
    });
    expect(first.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
  });

  it('возвращает журнал разработчика страницами и отклоняет неверную пагинацию', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const payload = impression(ad);
    await app.inject({
      method: 'POST',
      url: '/v1/events/impression',
      headers: signedHeaders(developer.token, developer.eventSecret!, 'impression', payload),
      payload,
    });

    const page = await app.inject({
      method: 'GET',
      url: '/v1/developer/events?page=1&pageSize=5',
      headers: auth(developer.token),
    });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({
      pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
    });
    expect(page.json().events).toHaveLength(1);

    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/developer/events?page=0&pageSize=5',
      headers: auth(developer.token),
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('регистрирует версии интеграций и уведомляет администратора до подтверждения', async () => {
    const developer = await registerDeveloper();
    const admin = await login('admin@kodpauza.local', 'admin123456');
    const version = `99.${Date.now()}.1`;
    const payload = {
      tool: 'claude',
      version,
      supported: false,
      compatibilityMode: 'unsupported',
      clientVersion: '0.3.0',
      editorName: 'Cursor',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/developer/integrations/version-report',
      headers: auth(developer.token),
      payload,
    });
    const repeated = await app.inject({
      method: 'POST',
      url: '/v1/developer/integrations/version-report',
      headers: auth(developer.token),
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().isNew).toBe(true);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().report.reportCount).toBe(2);
    expect(
      integrationAlerts.filter((alert) => alert.tool === 'claude' && alert.version === version),
    ).toHaveLength(1);
    expect(
      integrationAlerts.find((alert) => alert.tool === 'claude' && alert.version === version),
    ).toMatchObject({
      attention: 'new_patch',
      latestExactVersion: '2.1.280',
    });

    const outdatedClaudeVersion = '2.1.173';
    const outdatedClaude = await app.inject({
      method: 'POST',
      url: '/v1/developer/integrations/version-report',
      headers: auth(developer.token),
      payload: {
        ...payload,
        version: outdatedClaudeVersion,
      },
    });
    expect(outdatedClaude.statusCode).toBe(201);
    expect(
      integrationAlerts.find(
        (alert) => alert.tool === 'claude' && alert.version === outdatedClaudeVersion,
      ),
    ).toMatchObject({
      attention: 'outdated_tool',
      latestExactVersion: '2.1.280',
    });

    const structural = await app.inject({
      method: 'POST',
      url: '/v1/developer/integrations/version-report',
      headers: auth(developer.token),
      payload: {
        ...payload,
        version: `98.${Date.now()}.1`,
        supported: true,
        compatibilityMode: 'structural',
      },
    });
    expect(structural.statusCode).toBe(201);
    expect(structural.json().report).toMatchObject({
      supported: true,
      compatibilityMode: 'structural',
    });

    const legacyCodex = await app.inject({
      method: 'POST',
      url: '/v1/developer/integrations/codex/version-report',
      headers: auth(developer.token),
      payload: { ...payload, tool: undefined },
    });
    expect(legacyCodex.statusCode).toBe(201);
    expect(legacyCodex.json().report).toMatchObject({ tool: 'codex', version });
    expect(
      integrationAlerts.filter((alert) => alert.tool === 'codex' && alert.version === version),
    ).toHaveLength(1);

    const reports = await app.inject({
      method: 'GET',
      url: '/v1/admin/integration-versions?page=1&pageSize=50',
      headers: auth(admin.token),
    });
    const report = reports
      .json()
      .reports.find(
        (item: { tool: string; version: string }) =>
          item.tool === 'claude' && item.version === version,
      );
    expect(reports.statusCode).toBe(200);
    expect(reports.json()).toMatchObject({
      pagination: { page: 1, pageSize: 50, total: expect.any(Number), totalPages: 1 },
      summary: { pending: expect.any(Number) },
    });
    expect(report).toMatchObject({
      tool: 'claude',
      version,
      supported: false,
      compatibilityMode: 'unsupported',
      attention: 'new_patch',
      latestExactVersion: '2.1.280',
      acknowledgedAt: null,
    });
    expect(
      reports
        .json()
        .reports.find(
          (item: { tool: string; version: string }) =>
            item.tool === 'claude' && item.version === outdatedClaudeVersion,
        ),
    ).toMatchObject({
      attention: 'outdated_tool',
      latestExactVersion: '2.1.280',
    });

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/v1/admin/integration-versions/${report.id}/acknowledge`,
      headers: auth(admin.token),
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().report.acknowledgedAt).toBeTruthy();
    expect(
      await prisma.adminAuditLog.count({
        where: { targetId: report.id, action: 'integration.version.acknowledge' },
      }),
    ).toBe(1);
  });

  it('валидирует экономику, HTTPS и неизвестные поля кампании', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const base = {
      name: 'Проверка контракта',
      text: 'Надежное облако для разработчиков',
      url: 'https://example.ru/product',
      erid: '2Vtzq-contract',
      cpmKopecks: 30_000,
      budgetKopecks: 100_000,
    };
    const lowCpm = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: { ...base, cpmKopecks: 1999 },
    });
    const http = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: { ...base, url: 'http://example.ru' },
    });
    const typo = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: { ...base, placement: 'codex_vscode' },
    });
    const evenWithoutDailyBudget = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: { ...base, deliveryMode: 'even' },
    });
    const dailyBudgetBelowOneImpression = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: { ...base, dailyBudgetKopecks: 29 },
    });
    expect(lowCpm.statusCode).toBe(400);
    expect(http.statusCode).toBe(400);
    expect(typo.statusCode).toBe(400);
    expect(evenWithoutDailyBudget.statusCode).toBe(400);
    expect(dailyBudgetBelowOneImpression.statusCode).toBe(400);
  });

  it('строит рыночный прогноз по поверхности, CPM и фактической истории', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const developer = await prisma.user.findFirstOrThrow({
      where: { role: 'developer' },
    });
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { creatives: { some: {} } },
      include: { creatives: { take: 1 } },
    });
    const eventIds = Array.from({ length: 12 }, () => randomUUID());
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(12, 0, 0, 0);

    try {
      await prisma.adEvent.createMany({
        data: eventIds.map((eventId) => ({
          eventId,
          userId: developer.id,
          campaignId: campaign.id,
          creativeId: campaign.creatives[0]!.id,
          adId: randomUUID(),
          type: 'impression',
          surface: 'codex_vscode',
          visibleMs: 5_200,
          clientVersion: '0.7.22',
          toolName: 'codex',
          toolVersion: 'test',
          fraudStatus: 'clean',
          createdAt: yesterday,
        })),
      });
      const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
      const response = await app.inject({
        method: 'GET',
        url: `/v1/advertiser/forecast?budgetKopecks=100000&cpmKopecks=30000&format=standard&surfaces=codex_vscode&surfaceCpms=codex_vscode%3A30000&impressionsLimit=100&endsAt=${encodeURIComponent(endsAt)}`,
        headers: auth(advertiser.token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        basis: { sampleDays: 28, surfaces: ['codex_vscode'] },
        placements: [
          {
            surface: 'codex_vscode',
            cpmKopecks: 30_000,
            billableCpmKopecks: 30_000,
          },
        ],
      });
      expect(response.json().basis.recentImpressions).toBeGreaterThanOrEqual(12);
      expect(response.json().completionProbability).toEqual(expect.any(Number));
    } finally {
      await prisma.adEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    }
  });

  it('фиксирует премиальную наценку и возвращает формат в рекламной выдаче', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const admin = await login('admin@kodpauza.local', 'admin123456');
    const developer = await registerDeveloper();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: {
        name: 'Премиальная кампания',
        text: 'Премиальная инфраструктура для разработки',
        url: 'https://example.ru/premium',
        erid: 'premium-erid',
        cpmKopecks: 40_000,
        budgetKopecks: 100_000,
        format: 'premium',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().campaign).toMatchObject({
      format: 'premium',
      cpmKopecks: 40_000,
      billableCpmKopecks: 60_000,
      erid: 'premium-erid',
    });

    const campaignId = created.json().campaign.id as string;
    const approved = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${campaignId}/approve`,
      headers: auth(admin.token),
      payload: { reviewedUpdatedAt: created.json().campaign.updatedAt },
    });
    expect(approved.statusCode).toBe(200);

    const ad = await nextAd(developer.token);
    expect(ad).toMatchObject({ campaignId, format: 'premium' });
    expect(await prisma.adServe.findUniqueOrThrow({ where: { adId: ad.adId } })).toMatchObject({
      format: 'premium',
      cpmKopecks: 40_000,
      billableCpmKopecks: 60_000,
      costKopecks: 60,
      rewardKopecks: 30,
    });
  });

  it('не активирует кампанию, пока у каждого креатива нет ERID', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const admin = await login('admin@kodpauza.local', 'admin123456');
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: {
        name: 'Неполная маркировка',
        text: 'Объявление без токена одного из вариантов',
        url: 'https://example.ru/incomplete',
        cpmKopecks: 30_000,
        budgetKopecks: 100_000,
      },
    });
    expect(created.statusCode).toBe(201);

    const approved = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${created.json().campaign.id}/approve`,
      headers: auth(admin.token),
      payload: { reviewedUpdatedAt: created.json().campaign.updatedAt },
    });

    expect(approved.statusCode).toBe(409);
    expect(approved.json()).toMatchObject({
      code: 'CAMPAIGN_COMPLIANCE_REQUIRED',
      issues: [expect.stringContaining('ERID')],
    });
  });

  it('модерирует тот же бренд и все креативы, которые может отдать рекламная выдача', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const admin = await login('admin@kodpauza.local', 'admin123456');
    const developer = await registerDeveloper();
    const activeBefore = await prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    let campaignId: string | undefined;

    try {
      await prisma.campaign.updateMany({
        where: { id: { in: activeBefore.map((campaign) => campaign.id) } },
        data: { status: 'paused' },
      });
      const startsAt = new Date(Date.now() - 60_000).toISOString();
      const endsAt = new Date(Date.now() + 86_400_000).toISOString();
      const creatives = [
        {
          label: 'Основной',
          text: 'Канонический основной вариант',
          url: 'https://example.ru/canonical',
          erid: 'canonical-erid',
        },
        {
          label: 'Вариант B',
          text: 'Второй вариант, который тоже должен пройти модерацию',
          url: 'https://example.ru/variant-b',
          erid: 'variant-b-erid',
        },
      ];
      const created = await app.inject({
        method: 'POST',
        url: '/v1/advertiser/campaigns',
        headers: auth(advertiser.token),
        payload: {
          name: 'Кампания без расхождения модерации',
          text: 'Legacy-текст не должен попасть в выдачу',
          url: 'https://example.ru/legacy-mismatch',
          cpmKopecks: 30_000,
          budgetKopecks: 100_000,
          deliveryMode: 'even',
          dailyBudgetKopecks: 10_000,
          frequencyCapPerDay: 3,
          startsAt,
          endsAt,
          surfaces: [{ surface: 'codex_vscode', cpmKopecks: 30_000 }],
          creatives,
        },
      });
      expect(created.statusCode).toBe(201);
      campaignId = created.json().campaign.id as string;
      expect(created.json().campaign).toMatchObject({
        text: creatives[0]!.text,
        url: creatives[0]!.url,
        advertiser: { companyName: expect.any(String) },
      });

      const adminCampaigns = await app.inject({
        method: 'GET',
        url: '/v1/admin/campaigns',
        headers: auth(admin.token),
      });
      expect(adminCampaigns.statusCode).toBe(200);
      const moderated = adminCampaigns
        .json()
        .campaigns.find((campaign: { id: string }) => campaign.id === campaignId);
      expect(moderated).toMatchObject({
        status: 'pending',
        text: creatives[0]!.text,
        url: creatives[0]!.url,
        deliveryMode: 'even',
        dailyBudgetKopecks: 10_000,
        frequencyCapPerDay: 3,
        advertiser: {
          companyName: expect.any(String),
          user: { email: 'adv@kodpauza.local' },
        },
        surfaces: [expect.objectContaining({ surface: 'codex_vscode', enabled: true })],
      });
      expect(moderated.creatives).toEqual(
        creatives.map((creative) => expect.objectContaining({ ...creative, enabled: true })),
      );
      expect(moderated.startsAt).toBeTruthy();
      expect(moderated.endsAt).toBeTruthy();

      const advertiserCampaigns = await app.inject({
        method: 'GET',
        url: '/v1/advertiser/campaigns',
        headers: auth(advertiser.token),
      });
      const visibleToAdvertiser = advertiserCampaigns
        .json()
        .campaigns.find((campaign: { id: string }) => campaign.id === campaignId);
      expect(visibleToAdvertiser).toMatchObject({
        advertiser: { companyName: moderated.advertiser.companyName },
        deliveryMode: 'even',
        dailyBudgetKopecks: 10_000,
        frequencyCapPerDay: 3,
      });
      expect(visibleToAdvertiser.creatives).toHaveLength(2);
      expect(visibleToAdvertiser.surfaces).toHaveLength(1);

      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/v1/admin/campaigns/${campaignId}/approve`,
            headers: auth(admin.token),
            payload: { reviewedUpdatedAt: moderated.updatedAt },
          })
        ).statusCode,
      ).toBe(200);

      const ad = await nextAd(developer.token);
      expect(ad.campaignId).toBe(campaignId);
      expect(ad.advertiserName).toBe(moderated.advertiser.publicName);
      expect(ad.campaignName).toBe(moderated.name);
      expect(moderated.creatives).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: ad.creativeId, text: ad.text, enabled: true }),
        ]),
      );
      const servedCreative = moderated.creatives.find(
        (creative: { id: string }) => creative.id === ad.creativeId,
      );
      expect(new URL(ad.url).origin + new URL(ad.url).pathname).toBe(servedCreative.url);
      expect(new URL(ad.url).searchParams.get('erid')).toBe(servedCreative.erid);
      expect(ad.text).not.toBe('Legacy-текст не должен попасть в выдачу');
      expect(ad.url).not.toBe('https://example.ru/legacy-mismatch');
    } finally {
      if (campaignId) {
        await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
      }
      await prisma.campaign.updateMany({
        where: { id: { in: activeBefore.map((campaign) => campaign.id) } },
        data: { status: 'active' },
      });
    }
  });

  it('не активирует непроверенную редакцию при одновременных PATCH и approve', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const admin = await login('admin@kodpauza.local', 'admin123456');
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: {
        name: 'Гонка модерации',
        text: 'Проверенная версия предложения',
        url: 'https://example.ru/reviewed',
        erid: 'reviewed-erid',
        cpmKopecks: 30_000,
        budgetKopecks: 100_000,
      },
    });
    expect(created.statusCode).toBe(201);
    const campaignId = created.json().campaign.id as string;
    const baseline = await prisma.campaign.update({
      where: { id: campaignId },
      data: { updatedAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    const changedText = 'Новая версия, которую администратор еще не проверял';

    const [edited, approved] = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/v1/advertiser/campaigns/${campaignId}`,
        headers: auth(advertiser.token),
        payload: { text: changedText, url: 'https://example.ru/unreviewed' },
      }),
      app.inject({
        method: 'POST',
        url: `/v1/admin/campaigns/${campaignId}/approve`,
        headers: auth(admin.token),
        payload: { reviewedUpdatedAt: baseline.updatedAt.toISOString() },
      }),
    ]);

    expect(
      [edited.statusCode, approved.statusCode].every((status) => [200, 409].includes(status)),
    ).toBe(true);
    expect([edited.statusCode, approved.statusCode]).toContain(200);
    const persisted = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(persisted.status === 'active' && persisted.text === changedText).toBe(false);
    if (persisted.status === 'active') {
      expect(persisted.text).toBe('Проверенная версия предложения');
    } else {
      expect(persisted).toMatchObject({ status: 'pending', text: changedText });
    }
  });

  it('отклоняет лимит показов ниже уже выполненного без ошибки базы', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: {
        name: 'Проверка лимита показов',
        text: 'Инфраструктура для проверки лимита показов',
        url: 'https://example.ru/impressions-limit',
        cpmKopecks: 30_000,
        budgetKopecks: 100_000,
      },
    });
    expect(created.statusCode).toBe(201);
    const campaignId = created.json().campaign.id as string;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { impressionsServed: 7 },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/advertiser/campaigns/${campaignId}`,
      headers: auth(advertiser.token),
      payload: { impressionsLimit: 6 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Лимит показов не может быть меньше уже выполненных показов.',
    });
    expect(await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).toMatchObject({
      impressionsServed: 7,
      impressionsLimit: null,
      status: 'pending',
    });
  });

  it('возвращает измененную активную кампанию на модерацию и атомарно пишет решение', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const admin = await login('admin@kodpauza.local', 'admin123456');
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/campaigns',
      headers: auth(advertiser.token),
      payload: {
        name: 'Кампания модерации',
        text: 'Инфраструктура для быстрой разработки',
        url: 'https://example.ru/cloud',
        erid: '2Vtzq-moderation',
        cpmKopecks: 30_000,
        budgetKopecks: 100_000,
      },
    });
    const campaignId = created.json().campaign.id as string;
    expect(created.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/admin/campaigns/${campaignId}/approve`,
          headers: auth(admin.token),
          payload: { reviewedUpdatedAt: created.json().campaign.updatedAt },
        })
      ).statusCode,
    ).toBe(200);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/v1/advertiser/campaigns/${campaignId}`,
      headers: auth(advertiser.token),
      payload: { text: 'Обновленная инфраструктура для разработки' },
    });
    expect(edited.json().campaign.status).toBe('pending');
    expect(edited.json().campaign.creatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          text: 'Обновленная инфраструктура для разработки',
        }),
      ]),
    );

    const staleApproved = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${campaignId}/approve`,
      headers: auth(admin.token),
      payload: { reviewedUpdatedAt: created.json().campaign.updatedAt },
    });
    expect(staleApproved.statusCode).toBe(409);

    const staleRejected = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${campaignId}/reject`,
      headers: auth(admin.token),
      payload: {
        reason: 'Устаревшее решение модератора',
        reviewedUpdatedAt: created.json().campaign.updatedAt,
      },
    });
    expect(staleRejected.statusCode).toBe(409);

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${campaignId}/reject`,
      headers: auth(admin.token),
      payload: {
        reason: 'Уточните формулировку предложения',
        reviewedUpdatedAt: edited.json().campaign.updatedAt,
      },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().campaign.status).toBe('rejected');
    expect(
      await prisma.adminAuditLog.count({
        where: { targetId: campaignId, action: 'campaign.reject' },
      }),
    ).toBe(1);
  });

  it('создает произвольное пополнение идемпотентно и не принимает повтор requestId с другой суммой', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const requestId = randomUUID();
    const createCount = yooKassa.createCount;
    const payload = { amountKopecks: 123_456, requestId };

    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().payment).toMatchObject({
      amountKopecks: 123_456,
      currency: 'RUB',
      status: 'pending',
      providerTest: true,
    });
    expect(created.json().payment.confirmationUrl).toMatch(/^https:\/\/yookassa\.test\//);

    const repeated = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload,
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().payment.id).toBe(created.json().payment.id);
    expect(yooKassa.createCount).toBe(createCount + 1);

    const conflicting = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload: { amountKopecks: 123_457, requestId },
    });
    expect(conflicting.statusCode).toBe(409);
  });

  it('проверяет webhook через API ЮKassa и зачисляет успешный платеж ровно один раз', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const profileBefore = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiser.user.id },
    });
    yooKassa.createLivePaymentOnce();
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload: { amountKopecks: 54_321, requestId: randomUUID() },
    });
    const payment = created.json().payment as { id: string; providerPaymentId: string };

    const forged = await app.inject({
      method: 'POST',
      url: '/v1/payments/yookassa/webhook',
      payload: {
        type: 'notification',
        event: 'payment.succeeded',
        object: { id: payment.providerPaymentId },
      },
    });
    expect(forged.statusCode).toBe(200);
    expect(
      (await prisma.advertiserPayment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe('pending');

    yooKassa.succeed(payment.providerPaymentId);
    const notification = {
      method: 'POST' as const,
      url: '/v1/payments/yookassa/webhook',
      payload: {
        type: 'notification',
        event: 'payment.succeeded',
        object: { id: payment.providerPaymentId },
      },
    };
    expect((await app.inject(notification)).statusCode).toBe(200);
    expect((await app.inject(notification)).statusCode).toBe(200);

    const profileAfter = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiser.user.id },
    });
    expect(profileAfter.balanceKopecks - profileBefore.balanceKopecks).toBe(54_321);
    expect(await prisma.ledgerEntry.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(
      (await prisma.advertiserPayment.findUniqueOrThrow({ where: { id: payment.id } })).status,
    ).toBe('succeeded');
  });

  it('подтверждает тестовый платеж ЮKassa без пополнения расходуемого баланса', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const profileBefore = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiser.user.id },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload: { amountKopecks: 77_700, requestId: randomUUID() },
    });
    const payment = created.json().payment as { id: string; providerPaymentId: string };

    yooKassa.succeed(payment.providerPaymentId);
    const refreshed = await app.inject({
      method: 'POST',
      url: `/v1/advertiser/payments/${payment.id}/refresh`,
      headers: auth(advertiser.token),
      payload: {},
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().payment).toMatchObject({
      status: 'succeeded',
      providerTest: true,
      credited: false,
    });

    const profileAfter = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiser.user.id },
    });
    expect(profileAfter.balanceKopecks).toBe(profileBefore.balanceKopecks);
    expect(await prisma.ledgerEntry.count({ where: { paymentId: payment.id } })).toBe(0);
  });

  it('не зачисляет отмененный или подмененный платеж ЮKassa', async () => {
    const advertiser = await login('adv@kodpauza.local', 'adv123456');
    const profileBefore = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiser.user.id },
    });

    const canceledResponse = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload: { amountKopecks: 10_000, requestId: randomUUID() },
    });
    const canceled = canceledResponse.json().payment as { id: string; providerPaymentId: string };
    yooKassa.cancel(canceled.providerPaymentId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/advertiser/payments/${canceled.id}/refresh`,
          headers: auth(advertiser.token),
          payload: {},
        })
      ).json().payment.status,
    ).toBe('canceled');

    const tamperedResponse = await app.inject({
      method: 'POST',
      url: '/v1/advertiser/payments',
      headers: auth(advertiser.token),
      payload: { amountKopecks: 20_000, requestId: randomUUID() },
    });
    const tampered = tamperedResponse.json().payment as { id: string; providerPaymentId: string };
    const providerPayment = yooKassa.payments.get(tampered.providerPaymentId)!;
    providerPayment.metadata = {
      ...providerPayment.metadata,
      kodpauza_payment_id: 'another-payment',
    };
    yooKassa.succeed(tampered.providerPaymentId);
    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/advertiser/payments/${tampered.id}/refresh`,
      headers: auth(advertiser.token),
      payload: {},
    });
    expect(rejected.statusCode).toBe(409);

    const profileAfter = await prisma.advertiserProfile.findUniqueOrThrow({
      where: { userId: advertiser.user.id },
    });
    expect(profileAfter.balanceKopecks).toBe(profileBefore.balanceKopecks);
    expect(
      await prisma.ledgerEntry.count({ where: { paymentId: { in: [canceled.id, tampered.id] } } }),
    ).toBe(0);
  });

  it('резервирует выплату разработчика идемпотентно и полностью возвращает резерв при отмене', async () => {
    const developer = await registerDeveloper();
    const anotherDeveloper = await registerDeveloper();
    await prisma.developerProfile.update({
      where: { userId: developer.user.id },
      data: { balanceKopecks: 300_000 },
    });
    const payoutPolicy = await app.inject({
      method: 'GET',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
    });
    expect(payoutPolicy.statusCode).toBe(200);
    expect(payoutPolicy.json().policy.minAmountKopecks).toBe(30_000);

    const belowMinimum = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: {
        amountKopecks: 29_999,
        requestId: randomUUID(),
        ...developerPayoutRecipient,
      },
    });
    expect(belowMinimum.statusCode).toBe(400);

    const invalidSbpPhone = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: {
        amountKopecks: 30_000,
        requestId: randomUUID(),
        ...developerPayoutRecipient,
        sbpPhone: '+1 202 555 0100',
      },
    });
    expect(invalidSbpPhone.statusCode).toBe(400);

    const requestId = randomUUID();
    const payload = { amountKopecks: 150_000, requestId, ...developerPayoutRecipient };

    const created = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload,
    });
    expect(created.statusCode).toBe(201);
    const payout = created.json().payout as {
      id: string;
      status: string;
      recipientName: string;
      sbpPhone: string;
      bankName: string;
    };
    expect(payout).toMatchObject({
      status: 'requested',
      recipientName: developerPayoutRecipient.recipientName,
      sbpPhone: '+79991234567',
      bankName: developerPayoutRecipient.bankName,
    });
    expect(created.body).not.toContain('idempotenceKey');
    expect(created.body).not.toContain('clientRequestId');

    const repeated = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload,
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().payout.id).toBe(payout.id);

    const changedAmount = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: { amountKopecks: 160_000, requestId, ...developerPayoutRecipient },
    });
    const secondOpenRequest = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: {
        amountKopecks: 100_000,
        requestId: randomUUID(),
        ...developerPayoutRecipient,
      },
    });
    expect(changedAmount.statusCode).toBe(409);
    expect(secondOpenRequest.statusCode).toBe(409);

    const reserved = await prisma.developerProfile.findUniqueOrThrow({
      where: { userId: developer.user.id },
    });
    expect(reserved).toMatchObject({ balanceKopecks: 150_000, reservedKopecks: 150_000 });
    expect(
      await prisma.ledgerEntry.count({
        where: { payoutId: payout.id, type: 'payout_reserved' },
      }),
    ).toBe(1);

    const foreignCancel = await app.inject({
      method: 'POST',
      url: `/v1/developer/payouts/${payout.id}/cancel`,
      headers: auth(anotherDeveloper.token),
    });
    expect(foreignCancel.statusCode).toBe(404);

    const cancelRequest = {
      method: 'POST' as const,
      url: `/v1/developer/payouts/${payout.id}/cancel`,
      headers: auth(developer.token),
    };
    expect((await app.inject(cancelRequest)).statusCode).toBe(200);
    expect((await app.inject(cancelRequest)).statusCode).toBe(200);

    const released = await prisma.developerProfile.findUniqueOrThrow({
      where: { userId: developer.user.id },
    });
    expect(released).toMatchObject({ balanceKopecks: 300_000, reservedKopecks: 0 });
    expect(
      await prisma.ledgerEntry.findMany({
        where: { payoutId: payout.id },
        select: { type: true, amountKopecks: true },
        orderBy: { createdAt: 'asc' },
      }),
    ).toEqual([
      { type: 'payout_reserved', amountKopecks: -150_000 },
      { type: 'payout_released', amountKopecks: 150_000 },
    ]);
  });

  it('подтверждает ручной перевод один раз и не позволяет повторно использовать его номер', async () => {
    const developer = await registerDeveloper();
    const admin = await login('admin@kodpauza.local', 'admin123456');
    await prisma.developerProfile.update({
      where: { userId: developer.user.id },
      data: { balanceKopecks: 250_000 },
    });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: {
        amountKopecks: 100_000,
        requestId: randomUUID(),
        ...developerPayoutRecipient,
      },
    });
    const firstPayoutId = first.json().payout.id as string;
    const adminPayouts = await app.inject({
      method: 'GET',
      url: '/v1/admin/payouts',
      headers: auth(admin.token),
    });
    expect(adminPayouts.statusCode).toBe(200);
    expect(
      adminPayouts.json().payouts.find((item: { id: string }) => item.id === firstPayoutId),
    ).toMatchObject({
      recipientName: developerPayoutRecipient.recipientName,
      sbpPhone: '+79991234567',
      bankName: developerPayoutRecipient.bankName,
    });
    const paidRequest = {
      method: 'POST' as const,
      url: `/v1/admin/payouts/${firstPayoutId}/paid`,
      headers: auth(admin.token),
      payload: { externalReference: 'bank-transfer-001', note: 'Переведено по СБП' },
    };
    expect((await app.inject(paidRequest)).statusCode).toBe(200);
    expect((await app.inject(paidRequest)).statusCode).toBe(200);
    const conflictingRepeat = await app.inject({
      ...paidRequest,
      payload: { externalReference: 'bank-transfer-another' },
    });
    expect(conflictingRepeat.statusCode).toBe(409);

    const paidProfile = await prisma.developerProfile.findUniqueOrThrow({
      where: { userId: developer.user.id },
    });
    expect(paidProfile).toMatchObject({
      balanceKopecks: 150_000,
      reservedKopecks: 0,
      paidKopecks: 100_000,
    });
    expect(
      await prisma.ledgerEntry.count({
        where: { payoutId: firstPayoutId, type: 'payout_succeeded' },
      }),
    ).toBe(1);
    expect(
      await prisma.adminAuditLog.count({
        where: { targetId: firstPayoutId, action: 'developer-payout.paid' },
      }),
    ).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: {
        amountKopecks: 100_000,
        requestId: randomUUID(),
        ...developerPayoutRecipient,
      },
    });
    const secondPayoutId = second.json().payout.id as string;
    const duplicateTransfer = await app.inject({
      method: 'POST',
      url: `/v1/admin/payouts/${secondPayoutId}/paid`,
      headers: auth(admin.token),
      payload: { externalReference: 'bank-transfer-001' },
    });
    expect(duplicateTransfer.statusCode).toBe(409);

    const rejectRequest = {
      method: 'POST' as const,
      url: `/v1/admin/payouts/${secondPayoutId}/reject`,
      headers: auth(admin.token),
      payload: { reason: 'Не удалось подтвердить получателя' },
    };
    expect((await app.inject(rejectRequest)).statusCode).toBe(200);
    expect((await app.inject(rejectRequest)).statusCode).toBe(200);

    const finalProfile = await prisma.developerProfile.findUniqueOrThrow({
      where: { userId: developer.user.id },
    });
    expect(finalProfile).toMatchObject({
      balanceKopecks: 150_000,
      reservedKopecks: 0,
      paidKopecks: 100_000,
    });
    expect(
      await prisma.ledgerEntry.count({
        where: { payoutId: secondPayoutId, type: 'payout_released' },
      }),
    ).toBe(1);
    expect(
      await prisma.adminAuditLog.count({
        where: { targetId: secondPayoutId, action: 'developer-payout.rejected' },
      }),
    ).toBe(1);
  });
});

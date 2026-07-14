import { createHash, createHmac, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eventSignaturePayload, type SignableKodpauzaEvent } from '@kodpauza/shared';
import { buildApp } from '../src/app.js';
import { signToken } from '../src/auth.js';
import { config } from '../src/config.js';
import type { EmailVerificationMailer } from '../src/email.js';
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

  isConfigured() {
    return true;
  }

  async createPayment(input: CreateYooKassaPaymentInput): Promise<YooKassaPayment> {
    this.createCount += 1;
    const id = `test-${input.localPaymentId}`;
    const existing = this.payments.get(id);
    if (existing) return structuredClone(existing);
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
      test: true,
      created_at: new Date().toISOString(),
    };
    this.payments.set(id, payment);
    return structuredClone(payment);
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
const app = buildApp({ yooKassaClient: yooKassa, emailVerificationMailer });

type Login = { token: string; eventSecret: string | null; user: { id: string } };
type ExtensionLogin = Login & { refreshToken: string };
type Ad = {
  adId: string;
  campaignId: string;
  surface: 'codex_vscode';
  trackable: boolean;
  format: 'standard' | 'premium';
};

const tokenIps = new Map<string, string>();
let nextTestIp = 10;

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

async function registerAndVerifyDeveloper(email: string, password = 'password123'): Promise<Login> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password,
      role: 'developer',
      captchaToken: 'kodpauza-local-captcha-pass',
    },
  });
  expect(response.statusCode).toBe(201);
  expect(response.json()).toMatchObject({ verificationRequired: true });
  expect(response.body).not.toContain('token');
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

function impression(ad: Ad, visibleMs = 5200): SignableKodpauzaEvent & { visibleMs: number } {
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

describe('kodpauza api', () => {
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

    const refreshed = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<ExtensionLogin>()).toMatchObject({
      refreshToken: session.refreshToken,
      eventSecret: session.eventSecret,
    });

    const loggedOut = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/logout',
      payload: { refreshToken: session.refreshToken },
    });
    expect(loggedOut.statusCode).toBe(204);
    expect(
      (await prisma.extensionSession.findUniqueOrThrow({ where: { id: stored.id } })).revokedAt,
    ).not.toBeNull();

    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/auth/extension/refresh',
      payload: { refreshToken: session.refreshToken },
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
        name: 'Лишнее поле',
      },
    });
    expect(admin.statusCode).toBe(403);
    expect(typo.statusCode).toBe(400);
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
      url: '/v1/admin/events',
      headers: auth(admin.token),
    });
    expect(adminEvents.statusCode).toBe(200);
    expect(adminEvents.body).not.toContain('ipHash');
    expect(adminEvents.body).not.toContain('userAgentHash');
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
    expect(laterResponse.json()).toMatchObject({ fraudStatus: 'clean', rewardKopecks: 15 });
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

  it('учитывает только один чистый клик на одну выдачу', async () => {
    const developer = await registerDeveloper();
    const ad = await nextAd(developer.token);
    const payload = { ...impression(ad), visibleMs: undefined };
    delete payload.visibleMs;
    const headers = signedHeaders(developer.token, developer.eventSecret!, 'click', payload);
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

    const reports = await app.inject({
      method: 'GET',
      url: '/v1/admin/integration-versions',
      headers: auth(admin.token),
    });
    const report = reports
      .json()
      .reports.find(
        (item: { tool: string; version: string }) =>
          item.tool === 'claude' && item.version === version,
      );
    expect(reports.statusCode).toBe(200);
    expect(report).toMatchObject({
      tool: 'claude',
      version,
      supported: false,
      compatibilityMode: 'unsupported',
      acknowledgedAt: null,
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
    expect(lowCpm.statusCode).toBe(400);
    expect(http.statusCode).toBe(400);
    expect(typo.statusCode).toBe(400);
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
    });

    const campaignId = created.json().campaign.id as string;
    const approved = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${campaignId}/approve`,
      headers: auth(admin.token),
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

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/admin/campaigns/${campaignId}/reject`,
      headers: auth(admin.token),
      payload: { reason: 'Уточните формулировку предложения' },
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
    const requestId = randomUUID();
    const payload = { amountKopecks: 150_000, requestId };

    const created = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload,
    });
    expect(created.statusCode).toBe(201);
    const payout = created.json().payout as { id: string; status: string };
    expect(payout.status).toBe('requested');
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
      payload: { amountKopecks: 160_000, requestId },
    });
    const secondOpenRequest = await app.inject({
      method: 'POST',
      url: '/v1/developer/payouts',
      headers: auth(developer.token),
      payload: { amountKopecks: 100_000, requestId: randomUUID() },
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
      payload: { amountKopecks: 100_000, requestId: randomUUID() },
    });
    const firstPayoutId = first.json().payout.id as string;
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
      payload: { amountKopecks: 100_000, requestId: randomUUID() },
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

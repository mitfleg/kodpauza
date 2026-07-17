import type { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { loginSchema, registerSchema, registrationLegalDocuments } from '@kodpauza/shared';
import { authenticate, signToken } from '../auth.js';
import { verifyCaptcha } from '../captcha.js';
import { config } from '../config.js';
import { isDisposableEmail } from '../disposable-email.js';
import type { EmailVerificationMailer } from '../email.js';
import { getClientIp, hashNullable } from '../http.js';
import { prisma } from '../prisma.js';

const dummyPasswordHash = bcrypt.hashSync('kodpauza-invalid-password', config.passwordSaltRounds);
const extensionTokenSchema = z.object({ refreshToken: z.string().min(40).max(200) }).strict();
const verificationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
const resendSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
export function registerAuthRoutes(app: FastifyInstance, mailer: EmailVerificationMailer) {
  app.post('/v1/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверные данные регистрации.' });
    if (Buffer.byteLength(parsed.data.password, 'utf8') > 72) {
      return reply.code(400).send({ error: 'Пароль слишком длинный.' });
    }
    if (parsed.data.role === 'admin' && !config.allowPublicAdminRegistration) {
      return reply.code(403).send({ error: 'Регистрация администратора закрыта.' });
    }
    if (isDisposableEmail(parsed.data.email, config.disposableEmailDomains)) {
      return disposableEmailRejected(reply);
    }
    if (!(await verifyCaptcha(parsed.data.captchaToken, getClientIp(request) ?? request.ip))) {
      return reply
        .code(400)
        .send({ error: 'Проверка CAPTCHA не пройдена.', code: 'CAPTCHA_FAILED' });
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return reply.code(409).send({ error: 'Пользователь уже существует.' });

    const passwordHash = await bcrypt.hash(parsed.data.password, config.passwordSaltRounds);
    const verification = createVerification(parsed.data.email);
    const ipHash = hashNullable(getClientIp(request));
    const userAgentHash = hashNullable(request.headers['user-agent']);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: parsed.data.email,
          passwordHash,
          role: parsed.data.role,
          displayName: parsed.data.displayName,
          emailVerificationCodeHash: verification.hash,
          emailVerificationCodeExpiresAt: verification.expiresAt,
          emailVerificationCodeSentAt: verification.sentAt,
          developerProfile:
            parsed.data.role === 'developer'
              ? {
                  create: {
                    installId: crypto.randomUUID(),
                    eventSecret: crypto.randomBytes(32).toString('hex'),
                  },
                }
              : undefined,
          advertiserProfile:
            parsed.data.role === 'advertiser'
              ? {
                  create: {
                    companyName: parsed.data.companyName ?? parsed.data.displayName ?? 'Компания',
                    inn: parsed.data.inn,
                    balanceKopecks: config.testAdvertiserCreditKopecks,
                  },
                }
              : undefined,
        },
        select: { id: true, email: true, role: true, displayName: true },
      });

      await tx.legalAcceptance.createMany({
        data: registrationLegalDocuments.map((document) => ({
          userId: created.id,
          documentType: document.type,
          documentVersion: document.version,
          source: 'registration',
          ipHash,
          userAgentHash,
        })),
      });

      if (created.role === 'advertiser' && config.testAdvertiserCreditKopecks > 0) {
        await tx.ledgerEntry.create({
          data: {
            userId: created.id,
            type: 'advertiser_credit',
            amountKopecks: config.testAdvertiserCreditKopecks,
            description: 'Тестовое пополнение для автоматизированного теста',
          },
        });
      }
      return created;
    });

    try {
      await sendVerificationCode(mailer, user.email, verification.code);
    } catch (error) {
      request.log.error({ err: error, userId: user.id }, 'Email verification delivery failed');
      await prisma.user.delete({ where: { id: user.id } }).catch((cleanupError: unknown) => {
        request.log.error(
          { err: cleanupError, userId: user.id },
          'Registration rollback after email failure failed',
        );
      });
      return reply.code(503).send({
        error: 'Не удалось отправить код подтверждения. Повторите отправку позже.',
      });
    }

    return reply.code(201).send({
      user: { ...user, emailVerified: false },
      email: user.email,
      verificationRequired: true,
      retryAfterSeconds: Math.ceil(config.emailVerificationResendCooldownMs / 1000),
    });
  });

  app.post('/v1/auth/verify-email', async (request, reply) => {
    const parsed = verificationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректный код подтверждения.' });
    if (isDisposableEmail(parsed.data.email, config.disposableEmailDomains)) {
      return disposableEmailRejected(reply);
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) return reply.code(400).send({ error: 'Код неверный или истек.' });
    if (user.emailVerifiedAt) return { verified: true };
    if (
      !user.emailVerificationCodeHash ||
      !user.emailVerificationCodeExpiresAt ||
      user.emailVerificationCodeExpiresAt <= new Date() ||
      user.emailVerificationAttempts >= config.emailVerificationMaxAttempts
    ) {
      return reply.code(400).send({ error: 'Код неверный или истек.' });
    }

    const suppliedHash = verificationHash(user.email, parsed.data.code);
    if (!safeEqual(suppliedHash, user.emailVerificationCodeHash)) {
      await prisma.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null },
        data: { emailVerificationAttempts: { increment: 1 } },
      });
      return reply.code(400).send({ error: 'Код неверный или истек.' });
    }

    const verifiedAt = new Date();
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        emailVerifiedAt: null,
        emailVerificationCodeHash: user.emailVerificationCodeHash,
        emailVerificationCodeExpiresAt: { gt: verifiedAt },
        emailVerificationAttempts: { lt: config.emailVerificationMaxAttempts },
      },
      data: {
        emailVerifiedAt: verifiedAt,
        emailVerificationCodeHash: null,
        emailVerificationCodeExpiresAt: null,
        emailVerificationCodeSentAt: null,
        emailVerificationAttempts: 0,
      },
    });
    if (updated.count !== 1) {
      return reply.code(409).send({ error: 'Статус аккаунта изменился. Повторите вход.' });
    }

    const publicUser = publicAuthUser(user, true);
    return {
      verified: true,
      user: publicUser,
      token: signToken(publicUser),
      eventSecret: await eventSecretForUser(user.id, user.role),
    };
  });

  app.post('/v1/auth/resend-verification', async (request, reply) => {
    const parsed = resendSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная почта.' });
    if (isDisposableEmail(parsed.data.email, config.disposableEmailDomains)) {
      return disposableEmailRejected(reply);
    }
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const defaultRetry = Math.ceil(config.emailVerificationResendCooldownMs / 1000);

    // Одинаковый ответ не позволяет использовать маршрут для перебора зарегистрированных адресов.
    if (!user || user.emailVerifiedAt) return { sent: true, retryAfterSeconds: defaultRetry };

    const now = Date.now();
    const nextAllowedAt =
      (user.emailVerificationCodeSentAt?.getTime() ?? 0) + config.emailVerificationResendCooldownMs;
    if (nextAllowedAt > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((nextAllowedAt - now) / 1000));
      reply.header('Retry-After', String(retryAfterSeconds));
      return reply.code(429).send({
        error: 'Новый код уже отправлен. Попробуйте позже.',
        retryAfterSeconds,
      });
    }

    const verification = createVerification(user.email);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationCodeHash: verification.hash,
        emailVerificationCodeExpiresAt: verification.expiresAt,
        emailVerificationCodeSentAt: verification.sentAt,
        emailVerificationAttempts: 0,
      },
    });
    try {
      await sendVerificationCode(mailer, user.email, verification.code);
    } catch (error) {
      await prisma.user.updateMany({
        where: { id: user.id, emailVerificationCodeHash: verification.hash },
        data: {
          emailVerificationCodeHash: user.emailVerificationCodeHash,
          emailVerificationCodeExpiresAt: user.emailVerificationCodeExpiresAt,
          emailVerificationCodeSentAt: user.emailVerificationCodeSentAt,
          emailVerificationAttempts: user.emailVerificationAttempts,
        },
      });
      request.log.error({ err: error, userId: user.id }, 'Email verification resend failed');
      return reply.code(503).send({ error: 'Не удалось отправить новый код. Попробуйте позже.' });
    }
    return { sent: true, retryAfterSeconds: defaultRetry };
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверные данные входа.' });
    if (Buffer.byteLength(parsed.data.password, 'utf8') > 72) {
      return reply.code(401).send({ error: 'Неверная почта или пароль.' });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordOk = await bcrypt.compare(
      parsed.data.password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    if (!user || !passwordOk) return reply.code(401).send({ error: 'Неверная почта или пароль.' });
    if (isDisposableEmail(user.email, config.disposableEmailDomains)) {
      return disposableEmailRejected(reply, 403);
    }
    if (!user.emailVerifiedAt) return verificationRequired(reply, user.email);

    const publicUser = publicAuthUser(user, true);
    return {
      user: publicUser,
      token: signToken(publicUser),
      eventSecret: await eventSecretForUser(user.id, user.role),
    };
  });

  app.post('/v1/auth/extension/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверные данные входа.' });
    if (Buffer.byteLength(parsed.data.password, 'utf8') > 72) {
      return reply.code(401).send({ error: 'Неверная почта или пароль.' });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordOk = await bcrypt.compare(
      parsed.data.password,
      user?.passwordHash ?? dummyPasswordHash,
    );
    if (!user || !passwordOk) return reply.code(401).send({ error: 'Неверная почта или пароль.' });
    if (isDisposableEmail(user.email, config.disposableEmailDomains)) {
      return disposableEmailRejected(reply, 403);
    }
    if (!user.emailVerifiedAt) return verificationRequired(reply, user.email);
    if (user.role !== 'developer') {
      return reply.code(403).send({ error: 'Для расширения нужен аккаунт разработчика Kodpauza.' });
    }

    const refreshToken = createExtensionToken();
    await prisma.extensionSession.create({
      data: {
        userId: user.id,
        tokenHash: hashExtensionToken(refreshToken),
        expiresAt: extensionSessionExpiry(),
      },
    });

    const publicUser = publicAuthUser(user, true);
    return {
      user: publicUser,
      token: signToken(publicUser),
      refreshToken,
      eventSecret: await eventSecretForUser(user.id, user.role),
    };
  });

  app.post('/v1/auth/extension/refresh', async (request, reply) => {
    const parsed = extensionTokenSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная сессия расширения.' });

    const now = new Date();
    const currentTokenHash = hashExtensionToken(parsed.data.refreshToken);
    const session = await prisma.extensionSession.findUnique({
      where: { tokenHash: currentTokenHash },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.role !== 'developer'
    ) {
      return reply
        .code(401)
        .send({ error: 'Сессия расширения завершена. Войдите в Kodpauza заново.' });
    }
    if (isDisposableEmail(session.user.email, config.disposableEmailDomains)) {
      return disposableEmailRejected(reply, 403);
    }
    if (!session.user.emailVerifiedAt) return verificationRequired(reply, session.user.email);

    const nextRefreshToken = createExtensionToken();
    const rotated = await prisma.extensionSession.updateMany({
      where: {
        id: session.id,
        tokenHash: currentTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        tokenHash: hashExtensionToken(nextRefreshToken),
        lastUsedAt: now,
      },
    });
    if (rotated.count !== 1) {
      return reply
        .code(401)
        .send({ error: 'Сессия расширения завершена. Войдите в Kodpauza заново.' });
    }
    const publicUser = publicAuthUser(session.user, true);
    return {
      user: publicUser,
      token: signToken(publicUser),
      refreshToken: nextRefreshToken,
      eventSecret: await eventSecretForUser(session.user.id, session.user.role),
    };
  });

  app.post('/v1/auth/extension/bootstrap', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.authUser!.id } });
    if (!user || user.role !== 'developer') {
      return reply.code(403).send({ error: 'Для расширения нужен аккаунт разработчика Kodpauza.' });
    }

    const refreshToken = createExtensionToken();
    await prisma.extensionSession.create({
      data: {
        userId: user.id,
        tokenHash: hashExtensionToken(refreshToken),
        expiresAt: extensionSessionExpiry(),
      },
    });
    const publicUser = publicAuthUser(user, true);
    return {
      user: publicUser,
      token: signToken(publicUser),
      refreshToken,
      eventSecret: await eventSecretForUser(user.id, user.role),
    };
  });

  app.post('/v1/auth/extension/logout', async (request, reply) => {
    const parsed = extensionTokenSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная сессия расширения.' });

    await prisma.extensionSession.updateMany({
      where: { tokenHash: hashExtensionToken(parsed.data.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.get('/v1/auth/me', { preHandler: authenticate }, async (request) => ({
    user: await prisma.user.findUnique({
      where: { id: request.authUser!.id },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        emailVerifiedAt: true,
        developerProfile: {
          select: {
            balanceKopecks: true,
            totalImpressions: true,
            totalClicks: true,
            payoutStatus: true,
          },
        },
        advertiserProfile: {
          select: { companyName: true, inn: true, balanceKopecks: true },
        },
      },
    }),
  }));
}

function createVerification(email: string) {
  const sentAt = new Date();
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  return {
    code,
    hash: verificationHash(email, code),
    sentAt,
    expiresAt: new Date(sentAt.getTime() + config.emailVerificationCodeTtlMs),
  };
}

function verificationHash(email: string, code: string) {
  return crypto
    .createHmac('sha256', config.emailVerificationSecret)
    .update(`${email.toLowerCase()}\n${code}`)
    .digest('hex');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function sendVerificationCode(mailer: EmailVerificationMailer, email: string, code: string) {
  await mailer.sendVerificationCode({
    email,
    code,
    expiresInMinutes: Math.ceil(config.emailVerificationCodeTtlMs / 60_000),
  });
}

function verificationRequired(reply: FastifyReply, email: string) {
  return reply.code(403).send({
    error: 'Сначала подтвердите адрес электронной почты.',
    code: 'EMAIL_VERIFICATION_REQUIRED',
    verificationRequired: true,
    email,
  });
}

function publicAuthUser(
  user: {
    id: string;
    email: string;
    role: 'developer' | 'advertiser' | 'admin';
    displayName?: string | null;
  },
  emailVerified: boolean,
) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName ?? null,
    emailVerified,
  };
}

function disposableEmailRejected(reply: FastifyReply, statusCode: 400 | 403 = 400) {
  return reply.code(statusCode).send({
    error: 'Временные и одноразовые почтовые адреса не принимаются.',
    code: 'DISPOSABLE_EMAIL',
  });
}

function createExtensionToken(): string {
  return `kpr_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashExtensionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function extensionSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + config.extensionSessionTtlMs);
}

async function eventSecretForUser(userId: string, role: string) {
  if (role !== 'developer') return null;
  const profile = await prisma.developerProfile.findUnique({
    where: { userId },
    select: { eventSecret: true },
  });
  return profile?.eventSecret ?? null;
}

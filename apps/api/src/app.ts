import Fastify from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { config } from './config.js';
import { createEmailVerificationMailer, type EmailVerificationMailer } from './email.js';
import { prisma } from './prisma.js';
import { pruneRateLimitBuckets, rateLimit } from './rateLimit.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAdsRoutes } from './routes/ads.js';
import { registerAdvertiserRoutes } from './routes/advertiser.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDeveloperRoutes } from './routes/developer.js';
import { registerDeveloperPayoutRoutes } from './routes/developerPayouts.js';
import { registerEventRoutes } from './routes/events.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { YooKassaClient, type YooKassaClientContract } from './services/yookassa.js';
import { TelegramAdminNotifier, type AdminNotifier } from './services/adminNotifier.js';

export function buildApp(
  options: {
    yooKassaClient?: YooKassaClientContract;
    emailVerificationMailer?: EmailVerificationMailer;
    adminNotifier?: AdminNotifier;
  } = {},
) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    trustProxy: config.trustProxy,
    logger: {
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      serializers: {
        req(request) {
          return { method: request.method, url: request.url, host: request.hostname };
        },
      },
    },
  });
  const pruneTimer = setInterval(pruneRateLimitBuckets, config.rateLimitWindowMs);
  pruneTimer.unref();

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && isAllowedOrigin(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
    }
    reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    reply.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Kodpauza-Timestamp, X-Kodpauza-Signature',
    );
    reply.header('Vary', 'Origin');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (request.url.startsWith('/v1/')) reply.header('Cache-Control', 'no-store');
  });

  app.addHook('onRequest', rateLimit);

  app.addHook('onClose', async () => {
    clearInterval(pruneTimer);
  });

  app.options('/*', async (_request, reply) => {
    return reply.code(204).send();
  });

  app.get('/health', async () => ({ ok: true, status: 'ok', service: 'kodpauza-api' }));

  app.get('/ready', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, status: 'ready', service: 'kodpauza-api' };
  });

  registerAuthRoutes(app, options.emailVerificationMailer ?? createEmailVerificationMailer());
  registerAdsRoutes(app);
  registerEventRoutes(app);
  registerDeveloperRoutes(app, options.adminNotifier ?? new TelegramAdminNotifier());
  registerDeveloperPayoutRoutes(app);
  registerAdvertiserRoutes(app);
  registerPaymentRoutes(app, options.yooKassaClient ?? new YooKassaClient());
  registerAdminRoutes(app);

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: 'Маршрут не найден.' });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Ошибка валидации.',
        details: error.flatten(),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        return reply.code(409).send({ error: 'Такая запись уже существует.' });
      if (error.code === 'P2025') return reply.code(404).send({ error: 'Запись не найдена.' });
    }

    const maybeHttpError = error as { statusCode?: unknown; message?: unknown };
    if (typeof maybeHttpError.statusCode === 'number') {
      return reply.code(maybeHttpError.statusCode).send({
        error:
          typeof maybeHttpError.message === 'string' ? maybeHttpError.message : 'Ошибка запроса.',
      });
    }

    app.log.error(error);
    return reply.code(500).send({ error: 'Внутренняя ошибка сервера.' });
  });

  return app;
}

function isAllowedOrigin(origin: string): boolean {
  if (
    config.nodeEnv !== 'production' &&
    (/^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  ) {
    return true;
  }

  return config.allowedOrigins.includes(origin);
}

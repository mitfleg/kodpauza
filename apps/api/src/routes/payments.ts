import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { advertiserTopUpSchema } from '@kodpauza/shared';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import {
  YooKassaApiError,
  type YooKassaClientContract,
  type YooKassaPayment,
} from '../services/yookassa.js';

const notificationSchema = z
  .object({
    type: z.literal('notification'),
    event: z.enum(['payment.succeeded', 'payment.canceled']),
    object: z.object({ id: z.string().min(1).max(100) }).passthrough(),
  })
  .passthrough();

class PaymentIntegrityError extends Error {
  constructor(
    message: string,
    readonly code = 'integrity_mismatch',
  ) {
    super(message);
    this.name = 'PaymentIntegrityError';
  }
}

export function registerPaymentRoutes(app: FastifyInstance, yooKassa: YooKassaClientContract) {
  app.get('/v1/advertiser/payments', { preHandler: requireRole('advertiser') }, async (request) => {
    const advertiser = await advertiserProfile(request.authUser!.id);
    const payments = advertiser
      ? await prisma.advertiserPayment.findMany({
          where: { advertiserId: advertiser.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: publicPaymentSelect,
        })
      : [];
    return { enabled: yooKassa.isConfigured(), payments };
  });

  app.post(
    '/v1/advertiser/payments',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      if (!yooKassa.isConfigured()) {
        return reply
          .code(503)
          .send({ error: 'Пополнение временно недоступно: ЮKassa не настроена.' });
      }
      const parsed = advertiserTopUpSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Укажите сумму от 1 до 10 000 000 рублей.' });
      }

      const advertiser = await prisma.advertiserProfile.findUnique({
        where: { userId: request.authUser!.id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });

      const payment = await prisma.advertiserPayment.upsert({
        where: {
          advertiserId_clientRequestId: {
            advertiserId: advertiser.id,
            clientRequestId: parsed.data.requestId,
          },
        },
        create: {
          advertiserId: advertiser.id,
          clientRequestId: parsed.data.requestId,
          idempotenceKey: randomUUID(),
          amountKopecks: parsed.data.amountKopecks,
        },
        update: {},
      });

      if (payment.amountKopecks !== parsed.data.amountKopecks) {
        return reply
          .code(409)
          .send({ error: 'Этот идентификатор запроса уже использован для другой суммы.' });
      }
      if (payment.status === 'succeeded') return { payment: toPublicPayment(payment) };
      if (payment.status === 'failed' || payment.status === 'canceled') {
        return reply
          .code(409)
          .send({ error: 'Этот платеж уже завершен. Создайте новое пополнение.' });
      }
      if (payment.confirmationUrl) return { payment: toPublicPayment(payment) };

      const returnUrl = new URL('/advertiser', config.dashboardUrl);
      returnUrl.searchParams.set('payment', payment.id);

      try {
        const providerPayment = payment.providerPaymentId
          ? await yooKassa.getPayment(payment.providerPaymentId)
          : await yooKassa.createPayment({
              localPaymentId: payment.id,
              advertiserId: advertiser.id,
              amountKopecks: payment.amountKopecks,
              customerEmail: advertiser.user.email,
              returnUrl: returnUrl.toString(),
              idempotenceKey: payment.idempotenceKey,
            });

        await attachProviderPayment(payment.id, providerPayment);
        const reconciled = await reconcilePayment(payment.id, providerPayment);
        if (reconciled.status === 'pending' && !reconciled.confirmationUrl) {
          throw new PaymentIntegrityError(
            'ЮKassa не вернула ссылку для подтверждения платежа.',
            'missing_confirmation_url',
          );
        }
        return reply.code(201).send({ payment: toPublicPayment(reconciled) });
      } catch (error) {
        return handlePaymentError(request, reply, payment.id, error);
      }
    },
  );

  app.post(
    '/v1/advertiser/payments/:id/refresh',
    { preHandler: requireRole('advertiser') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const advertiser = await advertiserProfile(request.authUser!.id);
      if (!advertiser) return reply.code(403).send({ error: 'Профиль рекламодателя не найден.' });
      const payment = await prisma.advertiserPayment.findFirst({
        where: { id, advertiserId: advertiser.id },
      });
      if (!payment) return reply.code(404).send({ error: 'Платеж не найден.' });
      if (!payment.providerPaymentId || payment.status === 'failed') {
        return { payment: toPublicPayment(payment) };
      }

      try {
        const providerPayment = await yooKassa.getPayment(payment.providerPaymentId);
        return { payment: toPublicPayment(await reconcilePayment(payment.id, providerPayment)) };
      } catch (error) {
        return handlePaymentError(request, reply, payment.id, error);
      }
    },
  );

  app.post('/v1/payments/yookassa/webhook', async (request, reply) => {
    const parsed = notificationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректное уведомление.' });

    const localPayment = await prisma.advertiserPayment.findUnique({
      where: { providerPaymentId: parsed.data.object.id },
      select: { id: true },
    });
    if (!localPayment) return reply.code(200).send({ ok: true });

    try {
      const providerPayment = await yooKassa.getPayment(parsed.data.object.id);
      await reconcilePayment(localPayment.id, providerPayment);
      return reply.code(200).send({ ok: true });
    } catch (error) {
      request.log.error(
        { err: error, paymentId: localPayment.id },
        'YooKassa webhook reconciliation failed',
      );
      return reply.code(503).send({ error: 'Не удалось проверить платеж.' });
    }
  });
}

async function advertiserProfile(userId: string) {
  return prisma.advertiserProfile.findUnique({ where: { userId } });
}

async function attachProviderPayment(localPaymentId: string, providerPayment: YooKassaPayment) {
  const confirmationUrl = providerPayment.confirmation?.confirmation_url ?? null;
  if (confirmationUrl) {
    const parsed = new URL(confirmationUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new PaymentIntegrityError(
        'ЮKassa вернула небезопасную ссылку подтверждения.',
        'unsafe_confirmation_url',
      );
    }
  }
  await prisma.advertiserPayment.update({
    where: { id: localPaymentId },
    data: {
      providerPaymentId: providerPayment.id,
      confirmationUrl,
      providerTest: providerPayment.test ?? null,
      providerCreatedAt: providerPayment.created_at ? new Date(providerPayment.created_at) : null,
    },
  });
}

async function reconcilePayment(localPaymentId: string, providerPayment: YooKassaPayment) {
  const payment = await prisma.advertiserPayment.findUnique({
    where: { id: localPaymentId },
    include: { advertiser: { include: { user: { select: { id: true } } } } },
  });
  if (!payment) throw new PaymentIntegrityError('Локальный платеж не найден.');

  const metadataPaymentId = providerPayment.metadata?.kodpauza_payment_id;
  const metadataAdvertiserId = providerPayment.metadata?.kodpauza_advertiser_id;
  const integrityValid =
    providerPayment.id === payment.providerPaymentId &&
    providerPayment.amountKopecks === payment.amountKopecks &&
    providerPayment.amount.currency === 'RUB' &&
    metadataPaymentId === payment.id &&
    metadataAdvertiserId === payment.advertiserId;

  if (
    !integrityValid ||
    (providerPayment.status === 'succeeded' && providerPayment.paid !== true)
  ) {
    await prisma.advertiserPayment.update({
      where: { id: payment.id },
      data: { failureCode: 'integrity_mismatch' },
    });
    throw new PaymentIntegrityError('Данные платежа ЮKassa не совпали с локальной записью.');
  }

  if (providerPayment.status === 'succeeded') {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.advertiserPayment.updateMany({
        where: { id: payment.id, status: 'pending' },
        data: {
          status: 'succeeded',
          paidAt: new Date(),
          confirmationUrl: null,
          failureCode: null,
        },
      });
      if (claimed.count === 1) {
        await tx.advertiserProfile.update({
          where: { id: payment.advertiserId },
          data: { balanceKopecks: { increment: payment.amountKopecks } },
        });
        await tx.ledgerEntry.create({
          data: {
            userId: payment.advertiser.user.id,
            paymentId: payment.id,
            type: 'advertiser_credit',
            amountKopecks: payment.amountKopecks,
            description: `Пополнение через ЮKassa ${providerPayment.id}`,
          },
        });
      }
      return tx.advertiserPayment.findUniqueOrThrow({ where: { id: payment.id } });
    });
  }

  if (providerPayment.status === 'canceled') {
    return prisma.advertiserPayment.update({
      where: { id: payment.id },
      data: {
        status: payment.status === 'succeeded' ? 'succeeded' : 'canceled',
        canceledAt: payment.status === 'succeeded' ? payment.canceledAt : new Date(),
        confirmationUrl: null,
        failureCode: providerPayment.cancellation_details?.reason ?? null,
      },
    });
  }

  return prisma.advertiserPayment.update({
    where: { id: payment.id },
    data: {
      confirmationUrl: providerPayment.confirmation?.confirmation_url ?? payment.confirmationUrl,
      failureCode:
        providerPayment.status === 'waiting_for_capture' ? 'unexpected_waiting_for_capture' : null,
    },
  });
}

async function handlePaymentError(
  request: FastifyRequest,
  reply: FastifyReply,
  paymentId: string,
  error: unknown,
) {
  request.log.error({ err: error, paymentId }, 'YooKassa payment operation failed');
  if (error instanceof YooKassaApiError) {
    if (!error.retryable && error.providerCode !== 'not_configured') {
      await prisma.advertiserPayment.updateMany({
        where: { id: paymentId, providerPaymentId: null, status: 'pending' },
        data: { status: 'failed', failureCode: error.providerCode },
      });
    }
    return reply.code(error.providerCode === 'not_configured' ? 503 : 502).send({
      error: error.retryable
        ? 'ЮKassa временно не отвечает. Повторите запрос с той же страницы.'
        : 'ЮKassa не смогла создать платеж. Проверьте сумму и настройки магазина.',
    });
  }
  if (error instanceof PaymentIntegrityError) {
    await prisma.advertiserPayment.updateMany({
      where: { id: paymentId, status: 'pending' },
      data: { failureCode: error.code },
    });
    return reply.code(409).send({ error: 'Платеж требует ручной проверки. Баланс не изменен.' });
  }
  throw error;
}

const publicPaymentSelect = {
  id: true,
  providerPaymentId: true,
  amountKopecks: true,
  currency: true,
  status: true,
  confirmationUrl: true,
  providerTest: true,
  paidAt: true,
  canceledAt: true,
  failureCode: true,
  createdAt: true,
} as const;

function toPublicPayment(payment: {
  id: string;
  providerPaymentId: string | null;
  amountKopecks: number;
  currency: string;
  status: string;
  confirmationUrl: string | null;
  providerTest: boolean | null;
  paidAt: Date | null;
  canceledAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
}) {
  return {
    id: payment.id,
    providerPaymentId: payment.providerPaymentId,
    amountKopecks: payment.amountKopecks,
    currency: payment.currency,
    status: payment.status,
    confirmationUrl: payment.confirmationUrl,
    providerTest: payment.providerTest,
    paidAt: payment.paidAt,
    canceledAt: payment.canceledAt,
    failureCode: payment.failureCode,
    createdAt: payment.createdAt,
  };
}

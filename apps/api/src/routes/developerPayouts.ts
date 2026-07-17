import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { config } from '../config.js';
import { prisma } from '../prisma.js';
import {
  cancelDeveloperPayout,
  markDeveloperPayoutPaid,
  rejectDeveloperPayout,
  requestDeveloperPayout,
} from '../services/developerPayouts.js';

const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(5).max(50).default(10),
  })
  .strict();

const createPayoutSchema = z
  .object({
    amountKopecks: z.number().int().positive(),
    requestId: z.string().uuid(),
    recipientName: z.string().trim().min(3).max(120),
    sbpPhone: z.preprocess(
      (value) => (typeof value === 'string' ? normalizeRussianPhone(value) : value),
      z.string().regex(/^\+7\d{10}$/, 'Укажите российский номер телефона для СБП.'),
    ),
    bankName: z.string().trim().min(2).max(120),
  })
  .strict();

const paidSchema = z
  .object({
    externalReference: z.string().trim().min(3).max(120),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

const payoutSelect = {
  id: true,
  amountKopecks: true,
  currency: true,
  status: true,
  provider: true,
  recipientName: true,
  sbpPhone: true,
  bankName: true,
  externalReference: true,
  reviewNote: true,
  requestedAt: true,
  reviewedAt: true,
  paidAt: true,
  canceledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function registerDeveloperPayoutRoutes(app: FastifyInstance) {
  app.get(
    '/v1/developer/payouts',
    { preHandler: requireRole('developer') },
    async (request, reply) => {
      const parsed = paginationSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница выплат.' });
      const { page, pageSize } = parsed.data;
      const developer = await prisma.developerProfile.findUnique({
        where: { userId: request.authUser!.id },
        select: { id: true, balanceKopecks: true, reservedKopecks: true, paidKopecks: true },
      });
      if (!developer) return reply.code(404).send({ error: 'Профиль разработчика не найден.' });

      const [payouts, total] = await prisma.$transaction([
        prisma.developerPayout.findMany({
          where: { developerId: developer.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: payoutSelect,
        }),
        prisma.developerPayout.count({ where: { developerId: developer.id } }),
      ]);
      return {
        balances: {
          availableKopecks: developer.balanceKopecks,
          reservedKopecks: developer.reservedKopecks,
          paidKopecks: developer.paidKopecks,
        },
        policy: {
          minAmountKopecks: config.developerPayoutMinKopecks,
          maxAmountKopecks: config.developerPayoutMaxKopecks,
          manualReview: true,
          reviewPeriodDays: 3,
          paymentPeriodBusinessDays: 7,
        },
        payouts,
        pagination: pagination(total, page, pageSize),
      };
    },
  );

  app.post(
    '/v1/developer/payouts',
    { preHandler: requireRole('developer') },
    async (request, reply) => {
      const parsed = createPayoutSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({ error: 'Некорректная заявка на выплату.' });
      if (
        parsed.data.amountKopecks < config.developerPayoutMinKopecks ||
        parsed.data.amountKopecks > config.developerPayoutMaxKopecks
      ) {
        return reply.code(400).send({ error: 'Сумма выплаты находится вне допустимых лимитов.' });
      }
      const result = await requestDeveloperPayout(
        request.authUser!.id,
        parsed.data.amountKopecks,
        parsed.data.requestId,
        {
          recipientName: parsed.data.recipientName,
          sbpPhone: parsed.data.sbpPhone,
          bankName: parsed.data.bankName,
        },
      );
      return reply.code(result.created ? 201 : 200).send({ payout: payoutResponse(result.payout) });
    },
  );

  app.post(
    '/v1/developer/payouts/:id/cancel',
    { preHandler: requireRole('developer') },
    async (request) => {
      const { id } = request.params as { id: string };
      return { payout: payoutResponse(await cancelDeveloperPayout(request.authUser!.id, id)) };
    },
  );

  app.get('/v1/admin/payouts', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Некорректная страница выплат.' });
    const { page, pageSize } = parsed.data;
    const [payouts, total] = await prisma.$transaction([
      prisma.developerPayout.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...payoutSelect,
          developer: {
            select: {
              user: { select: { email: true, displayName: true } },
            },
          },
        },
      }),
      prisma.developerPayout.count(),
    ]);
    return { payouts, pagination: pagination(total, page, pageSize) };
  });

  app.post(
    '/v1/admin/payouts/:id/paid',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const parsed = paidSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Укажите номер или идентификатор перевода.' });
      }
      const { id } = request.params as { id: string };
      return {
        payout: payoutResponse(
          await markDeveloperPayoutPaid(
            request.authUser!.id,
            id,
            parsed.data.externalReference,
            parsed.data.note,
          ),
        ),
      };
    },
  );

  app.post(
    '/v1/admin/payouts/:id/reject',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const parsed = rejectSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Укажите причину отклонения.' });
      const { id } = request.params as { id: string };
      return {
        payout: payoutResponse(
          await rejectDeveloperPayout(request.authUser!.id, id, parsed.data.reason),
        ),
      };
    },
  );
}

function pagination(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function payoutResponse(payout: {
  id: string;
  amountKopecks: number;
  currency: string;
  status: string;
  provider: string;
  recipientName: string | null;
  sbpPhone: string | null;
  bankName: string | null;
  externalReference: string | null;
  reviewNote: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  paidAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: payout.id,
    amountKopecks: payout.amountKopecks,
    currency: payout.currency,
    status: payout.status,
    provider: payout.provider,
    recipientName: payout.recipientName,
    sbpPhone: payout.sbpPhone,
    bankName: payout.bankName,
    externalReference: payout.externalReference,
    reviewNote: payout.reviewNote,
    requestedAt: payout.requestedAt,
    reviewedAt: payout.reviewedAt,
    paidAt: payout.paidAt,
    canceledAt: payout.canceledAt,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
  };
}

function normalizeRussianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return `+7${digits}`;
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`;
  }
  return value.trim();
}

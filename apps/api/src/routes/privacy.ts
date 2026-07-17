import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../auth.js';
import { prisma } from '../prisma.js';

const requestSchema = z
  .object({
    type: z.enum(['access', 'correction', 'deletion', 'consent_withdrawal']),
    details: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === 'correction' && !value.details) {
      context.addIssue({ code: 'custom', path: ['details'], message: 'Опишите, что нужно исправить.' });
    }
  });

export function registerPrivacyRoutes(app: FastifyInstance) {
  app.get('/v1/privacy/requests', { preHandler: authenticate }, async (request) => ({
    requests: await prisma.privacyRequest.findMany({
      where: { userId: request.authUser!.id },
      orderBy: { createdAt: 'desc' },
    }),
  }));

  app.post('/v1/privacy/requests', { preHandler: authenticate }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Проверьте тип заявки и описание.' });
    }

    const existing = await prisma.privacyRequest.findFirst({
      where: {
        userId: request.authUser!.id,
        type: parsed.data.type,
        status: { in: ['requested', 'processing'] },
      },
    });
    if (existing) {
      return reply.code(409).send({ error: 'Такая заявка уже находится на рассмотрении.' });
    }

    const privacyRequest = await prisma.$transaction(async (tx) => {
      if (parsed.data.type === 'consent_withdrawal') {
        await tx.legalAcceptance.updateMany({
          where: {
            userId: request.authUser!.id,
            documentType: 'personal_data_consent',
            withdrawnAt: null,
          },
          data: { withdrawnAt: new Date() },
        });
      }
      return tx.privacyRequest.create({
        data: {
          userId: request.authUser!.id,
          type: parsed.data.type,
          details: parsed.data.details,
        },
      });
    });

    return reply.code(201).send({ request: privacyRequest });
  });

  app.get('/v1/privacy/export', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.authUser!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        developerProfile: {
          select: {
            balanceKopecks: true,
            reservedKopecks: true,
            paidKopecks: true,
            totalImpressions: true,
            totalClicks: true,
            payoutStatus: true,
            createdAt: true,
            payouts: { orderBy: { createdAt: 'desc' } },
          },
        },
        advertiserProfile: {
          select: {
            companyName: true,
            inn: true,
            balanceKopecks: true,
            createdAt: true,
            campaigns: { orderBy: { createdAt: 'desc' } },
            payments: {
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                amountKopecks: true,
                currency: true,
                status: true,
                provider: true,
                providerPaymentId: true,
                providerTest: true,
                paidAt: true,
                canceledAt: true,
                failureCode: true,
                createdAt: true,
              },
            },
          },
        },
        legalAcceptances: {
          orderBy: { acceptedAt: 'desc' },
          select: {
            documentType: true,
            documentVersion: true,
            source: true,
            acceptedAt: true,
            withdrawnAt: true,
          },
        },
        privacyRequests: { orderBy: { createdAt: 'desc' } },
        extensionInstalls: {
          orderBy: { createdAt: 'desc' },
          select: {
            installId: true,
            vscodeVersion: true,
            extensionVersion: true,
            os: true,
            integrationsEnabled: true,
            codexDetected: true,
            claudeDetected: true,
            lastSeenAt: true,
            createdAt: true,
          },
        },
        adEvents: {
          orderBy: { createdAt: 'desc' },
          select: {
            eventId: true,
            adId: true,
            campaignId: true,
            type: true,
            surface: true,
            visibleMs: true,
            rewardKopecks: true,
            clientVersion: true,
            toolName: true,
            toolVersion: true,
            fraudStatus: true,
            createdAt: true,
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            amountKopecks: true,
            description: true,
            createdAt: true,
          },
        },
      },
    });
    if (!user) return reply.code(404).send({ error: 'Пользователь не найден.' });

    reply.header('Content-Disposition', `attachment; filename="kodpauza-data-${user.id}.json"`);
    return {
      exportedAt: new Date().toISOString(),
      formatVersion: '1.0',
      user,
    };
  });
}

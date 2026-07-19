import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  accrueDeveloperReward,
  accrueImpressionCharge,
  clickEventSchema,
  eventSignaturePayload,
  impressionEventSchema,
  type KodpauzaEventType,
  type SignableKodpauzaEvent,
} from '@kodpauza/shared';
import { authenticate } from '../auth.js';
import { config } from '../config.js';
import { getClientIp, hashNullable } from '../http.js';
import { prisma } from '../prisma.js';
import { assessClick, assessImpression, type FraudDecision } from '../services/fraud.js';
import { deliveryEligibility, moscowDeliveryDay } from '../services/campaignDelivery.js';

type ImpressionEvent = z.infer<typeof impressionEventSchema>;
type ClickEvent = z.infer<typeof clickEventSchema>;

export function registerEventRoutes(app: FastifyInstance) {
  app.post('/v1/events/impression', { preHandler: authenticate }, async (request, reply) => {
    const observedAt = new Date();
    const parsed = impressionEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверное событие показа.' });

    const profile = await developerEventProfile(request.authUser!.id);
    if (!profile) return reply.code(403).send({ error: 'Показы доступны только разработчику.' });
    if (!verifyEventSignature(request, reply, 'impression', parsed.data, profile.eventSecret))
      return;

    const existing = await prisma.adEvent.findUnique({ where: { eventId: parsed.data.eventId } });
    if (existing)
      return sendDuplicate(reply, existing, parsed.data, request.authUser!.id, 'impression');

    try {
      const result = await recordImpression({
        event: parsed.data,
        userId: request.authUser!.id,
        ipHash: hashNullable(getClientIp(request)),
        userAgentHash: hashNullable(headerToString(request.headers['user-agent'])),
        observedAt,
      });
      return reply.code(201).send({
        eventId: result.eventId,
        fraudStatus: result.fraudStatus,
        rewardKopecks: result.rewardKopecks,
        duplicate: false,
      });
    } catch (error) {
      return handleEventError(error, reply, parsed.data, request.authUser!.id, 'impression');
    }
  });

  app.post('/v1/events/click', { preHandler: authenticate }, async (request, reply) => {
    const parsed = clickEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Неверное событие клика.' });

    const profile = await developerEventProfile(request.authUser!.id);
    if (!profile) return reply.code(403).send({ error: 'Клики доступны только разработчику.' });
    if (!verifyEventSignature(request, reply, 'click', parsed.data, profile.eventSecret)) return;

    const existing = await prisma.adEvent.findUnique({ where: { eventId: parsed.data.eventId } });
    if (existing) return sendDuplicate(reply, existing, parsed.data, request.authUser!.id, 'click');

    try {
      const result = await recordClick({
        event: parsed.data,
        userId: request.authUser!.id,
        ipHash: hashNullable(getClientIp(request)),
        userAgentHash: hashNullable(headerToString(request.headers['user-agent'])),
      });
      return reply.code(201).send({
        eventId: result.eventId,
        fraudStatus: result.fraudStatus,
        duplicate: false,
      });
    } catch (error) {
      return handleEventError(error, reply, parsed.data, request.authUser!.id, 'click');
    }
  });
}

async function developerEventProfile(userId: string) {
  return prisma.developerProfile.findUnique({
    where: { userId },
    select: { eventSecret: true },
  });
}

async function recordImpression(input: {
  event: ImpressionEvent;
  userId: string;
  ipHash: string | null;
  userAgentHash: string | null;
  observedAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const serveReference = await tx.adServe.findUnique({
      where: { adId: input.event.adId },
      select: { campaignId: true, userId: true },
    });
    if (!serveReference) throw new EventDomainError(404, 'Выдача рекламы не найдена.');
    if (serveReference.userId !== input.userId) {
      throw new EventDomainError(403, 'Событие не соответствует выданной рекламе.');
    }
    await lockCampaign(tx, serveReference.campaignId);
    const serve = await tx.adServe.findUnique({
      where: { adId: input.event.adId },
      include: {
        campaign: {
          include: {
            advertiser: { select: { id: true, userId: true } },
            surfaces: true,
          },
        },
      },
    });
    validateServe(serve, input.event, input.userId, 'impression');

    const campaign = serve.campaign;
    if (campaign.status !== 'active') {
      throw new EventDomainError(409, 'Кампания больше не доступна для показа.');
    }
    const placement = campaign.surfaces.find(
      (candidate) => candidate.surface === serve.surface && candidate.enabled,
    );
    if (
      !placement ||
      placement.cpmKopecks !== serve.cpmKopecks ||
      placement.billableCpmKopecks !== serve.billableCpmKopecks ||
      campaign.format !== serve.format
    ) {
      throw new EventDomainError(
        409,
        'Поверхность, формат или стоимость кампании изменились. Запросите новое объявление.',
      );
    }

    const fraud = await assessImpression(
      tx,
      input.userId,
      input.event.visibleMs,
      input.ipHash,
      input.observedAt,
    );
    if (fraud.status === 'rejected') {
      throw new EventDomainError(422, 'Показ слишком короткий.', fraud.reasons);
    }

    const developer = await tx.developerProfile.findUnique({
      where: { userId: input.userId },
      select: { rewardRemainderUnits: true },
    });
    if (!developer) throw new EventDomainError(403, 'Профиль разработчика не найден.');

    const charge = accrueImpressionCharge(
      placement.billableCpmKopecks,
      campaign.billingRemainderMilliKopecks,
    );
    const reward = accrueDeveloperReward(
      placement.billableCpmKopecks,
      developer.rewardRemainderUnits,
    );
    const clean = fraud.status === 'clean';
    const costKopecks = clean ? charge.amountKopecks : 0;
    const rewardKopecks = clean ? reward.amountKopecks : 0;

    const marked = await tx.adServe.updateMany({
      where: { id: serve.id, impressionRecordedAt: null },
      data: { impressionRecordedAt: new Date(), costKopecks, rewardKopecks },
    });
    if (marked.count === 0) throw new EventDomainError(409, 'Показ для этой выдачи уже записан.');

    const created = await tx.adEvent.create({
      data: {
        eventId: input.event.eventId,
        userId: input.userId,
        campaignId: campaign.id,
        creativeId: serve.creativeId,
        adServeId: serve.id,
        adId: input.event.adId,
        type: 'impression',
        surface: input.event.surface,
        visibleMs: input.event.visibleMs,
        rewardKopecks,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        clientVersion: input.event.clientVersion,
        toolName: input.event.toolName,
        toolVersion: input.event.toolVersion,
        fraudStatus: fraud.status,
      },
    });

    if (fraud.status === 'suspicious') {
      await createFraudFlag(tx, created.id, input.userId, fraud, {
        visibleMs: input.event.visibleMs,
        ...(fraud.concurrentAccount
          ? {
              conflictingUserId: fraud.concurrentAccount.userId,
              conflictingEventAt: fraud.concurrentAccount.eventAt.toISOString(),
            }
          : {}),
      });
      return created;
    }

    const { start: deliveryDay } = moscowDeliveryDay(input.observedAt);
    const [deliveryRow, frequencyToday] = await Promise.all([
      tx.campaignDeliveryDay.findUnique({
        where: { campaignId_day: { campaignId: campaign.id, day: deliveryDay } },
      }),
      campaign.frequencyCapPerDay === null
        ? Promise.resolve(0)
        : tx.adEvent.count({
            where: {
              campaignId: campaign.id,
              userId: input.userId,
              type: 'impression',
              fraudStatus: 'clean',
              createdAt: { gte: deliveryDay },
              id: { not: created.id },
            },
          }),
    ]);
    if (campaign.frequencyCapPerDay !== null && frequencyToday >= campaign.frequencyCapPerDay) {
      throw new EventDomainError(409, 'Дневной лимит этой кампании для пользователя исчерпан.');
    }
    const delivery = deliveryEligibility({
      now: input.observedAt,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      mode: campaign.deliveryMode,
      nextCostKopecks: costKopecks,
      remainingBudgetKopecks: campaign.budgetKopecks - campaign.spentKopecks,
      dailyBudgetKopecks: campaign.dailyBudgetKopecks,
      spentTodayKopecks: deliveryRow?.spentKopecks ?? 0,
    });
    if (!delivery.eligible) {
      throw new EventDomainError(409, 'Лимит, расписание или темп кампании изменились. Запросите новое объявление.');
    }

    const campaignUpdated = await tx.campaign.updateMany({
      where: {
        id: campaign.id,
        status: 'active',
        spentKopecks: { lte: campaign.budgetKopecks - costKopecks },
        ...(campaign.impressionsLimit === null
          ? {}
          : { impressionsServed: { lt: campaign.impressionsLimit } }),
      },
      data: {
        spentKopecks: { increment: costKopecks },
        impressionsServed: { increment: 1 },
        billingRemainderMilliKopecks: charge.remainderUnits,
      },
    });
    if (campaignUpdated.count === 0) {
      throw new EventDomainError(409, 'Бюджет или лимит показов кампании исчерпан.');
    }

    const advertiserUpdated = await tx.advertiserProfile.updateMany({
      where: { id: campaign.advertiser.id, balanceKopecks: { gte: costKopecks } },
      data: { balanceKopecks: { decrement: costKopecks } },
    });
    if (advertiserUpdated.count === 0) {
      throw new EventDomainError(409, 'На балансе рекламодателя недостаточно средств.');
    }

    await Promise.all([
      tx.campaignSurface.update({
        where: { id: placement.id },
        data: {
          spentKopecks: { increment: costKopecks },
          impressionsServed: { increment: 1 },
        },
      }),
      tx.campaignCreative.update({
        where: { id: serve.creativeId },
        data: { impressionsServed: { increment: 1 } },
      }),
      tx.campaignDeliveryDay.upsert({
        where: { campaignId_day: { campaignId: campaign.id, day: deliveryDay } },
        create: {
          campaignId: campaign.id,
          day: deliveryDay,
          spentKopecks: costKopecks,
          impressionsServed: 1,
        },
        update: {
          spentKopecks: { increment: costKopecks },
          impressionsServed: { increment: 1 },
        },
      }),
    ]);

    await tx.developerProfile.update({
      where: { userId: input.userId },
      data: {
        balanceKopecks: { increment: rewardKopecks },
        totalImpressions: { increment: 1 },
        rewardRemainderUnits: reward.remainderUnits,
      },
    });
    await tx.ledgerEntry.createMany({
      data: [
        {
          userId: campaign.advertiser.userId,
          eventId: created.id,
          type: 'advertiser_charge',
          amountKopecks: -costKopecks,
          description: `Списание за показ ${created.eventId}`,
        },
        {
          userId: input.userId,
          eventId: created.id,
          type: 'impression_reward',
          amountKopecks: rewardKopecks,
          description: `Начисление за показ ${created.eventId}`,
        },
      ],
    });

    return created;
  });
}

async function recordClick(input: {
  event: ClickEvent;
  userId: string;
  ipHash: string | null;
  userAgentHash: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const serve = await tx.adServe.findUnique({ where: { adId: input.event.adId } });
    validateServe(serve, input.event, input.userId, 'click');

    const impressionEvent = await tx.adEvent.findFirst({
      where: { adServeId: serve.id, type: 'impression' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { fraudStatus: true },
    });
    if (!impressionEvent) {
      throw new EventDomainError(409, 'Сначала должен быть подтвержден показ объявления.');
    }
    const clickFraud = await assessClick(tx, input.userId);
    const fraud: FraudDecision = impressionEvent.fraudStatus === 'clean'
      ? clickFraud
      : {
          status: 'suspicious',
          reasons: [...new Set(['suspicious_impression', ...clickFraud.reasons])],
        };
    const marked = await tx.adServe.updateMany({
      where: { id: serve.id, clickRecordedAt: null },
      data: { clickRecordedAt: new Date() },
    });
    if (marked.count === 0) throw new EventDomainError(409, 'Клик для этой выдачи уже записан.');

    const created = await tx.adEvent.create({
      data: {
        eventId: input.event.eventId,
        userId: input.userId,
        campaignId: serve.campaignId,
        creativeId: serve.creativeId,
        adServeId: serve.id,
        adId: input.event.adId,
        type: 'click',
        surface: input.event.surface,
        visibleMs: input.event.visibleMs,
        rewardKopecks: 0,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        clientVersion: input.event.clientVersion,
        toolName: input.event.toolName,
        toolVersion: input.event.toolVersion,
        fraudStatus: fraud.status,
      },
    });

    if (fraud.status === 'clean') {
      await tx.campaign.update({
        where: { id: serve.campaignId },
        data: { clicks: { increment: 1 } },
      });
      await Promise.all([
        tx.campaignCreative.update({
          where: { id: serve.creativeId },
          data: { clicks: { increment: 1 } },
        }),
        tx.campaignSurface.update({
          where: { campaignId_surface: { campaignId: serve.campaignId, surface: serve.surface } },
          data: { clicks: { increment: 1 } },
        }),
      ]);
      await tx.developerProfile.update({
        where: { userId: input.userId },
        data: { totalClicks: { increment: 1 } },
      });
    } else {
      await createFraudFlag(tx, created.id, input.userId, fraud);
    }

    return created;
  });
}

function validateServe<
  T extends {
    id: string;
    userId: string;
    campaignId: string;
    creativeId: string;
    surface: string;
    expiresAt: Date;
    impressionRecordedAt: Date | null;
    clickRecordedAt: Date | null;
  } | null,
>(
  serve: T,
  event: ImpressionEvent | ClickEvent,
  userId: string,
  type: KodpauzaEventType,
): asserts serve is Exclude<T, null> {
  if (!serve) throw new EventDomainError(404, 'Выдача рекламы не найдена.');
  if (
    serve.userId !== userId ||
    serve.campaignId !== event.campaignId ||
    serve.surface !== event.surface
  ) {
    throw new EventDomainError(403, 'Событие не соответствует выданной рекламе.');
  }
  if (serve.expiresAt.getTime() < Date.now()) {
    throw new EventDomainError(410, 'Срок подтверждения этой выдачи истек.');
  }
  if (type === 'impression' && serve.impressionRecordedAt) {
    throw new EventDomainError(409, 'Показ для этой выдачи уже записан.');
  }
  if (type === 'click' && serve.clickRecordedAt) {
    throw new EventDomainError(409, 'Клик для этой выдачи уже записан.');
  }
  if (type === 'click' && !serve.impressionRecordedAt) {
    throw new EventDomainError(409, 'Сначала должен быть подтвержден показ объявления.');
  }
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}

async function lockCampaign(tx: Prisma.TransactionClient, campaignId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'campaign:' + campaignId}))`;
}

async function createFraudFlag(
  tx: Prisma.TransactionClient,
  eventId: string,
  userId: string,
  fraud: FraudDecision,
  metadata?: Prisma.InputJsonObject,
) {
  await tx.fraudFlag.create({
    data: {
      userId,
      eventId,
      reason: fraud.reasons.join(','),
      severity: fraud.status === 'suspicious' ? 'medium' : 'high',
      metadata,
    },
  });
}

async function handleEventError(
  error: unknown,
  reply: FastifyReply,
  event: ImpressionEvent | ClickEvent,
  userId: string,
  type: KodpauzaEventType,
) {
  if (error instanceof EventDomainError) {
    return reply.code(error.statusCode).send({ error: error.message, reasons: error.reasons });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const existing = await prisma.adEvent.findUnique({ where: { eventId: event.eventId } });
    if (existing) return sendDuplicate(reply, existing, event, userId, type);
  }
  throw error;
}

function sendDuplicate(
  reply: FastifyReply,
  existing: {
    eventId: string;
    userId: string;
    type: KodpauzaEventType;
    adId: string;
    campaignId: string;
    surface: string;
    visibleMs: number | null;
    clientVersion: string;
    toolName: string;
    toolVersion: string;
    fraudStatus: string;
    rewardKopecks: number;
  },
  event: ImpressionEvent | ClickEvent,
  userId: string,
  type: KodpauzaEventType,
) {
  const same =
    existing.userId === userId &&
    existing.type === type &&
    existing.adId === event.adId &&
    existing.campaignId === event.campaignId &&
    existing.surface === event.surface &&
    existing.visibleMs === (event.visibleMs ?? null) &&
    existing.clientVersion === event.clientVersion &&
    existing.toolName === event.toolName &&
    existing.toolVersion === event.toolVersion;

  if (!same) return reply.code(409).send({ error: 'eventId уже использован для другого события.' });
  return reply.code(200).send({
    eventId: existing.eventId,
    fraudStatus: existing.fraudStatus,
    rewardKopecks: existing.rewardKopecks,
    duplicate: true,
  });
}

function headerToString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(',') : value;
}

function verifyEventSignature(
  request: FastifyRequest,
  reply: FastifyReply,
  type: KodpauzaEventType,
  event: SignableKodpauzaEvent,
  secret: string,
) {
  if (!config.requireEventSignatures) return true;

  const timestamp = headerToString(request.headers['x-kodpauza-timestamp']);
  const signature = headerToString(request.headers['x-kodpauza-signature'])?.replace(
    /^sha256=/,
    '',
  );
  if (!timestamp || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    reply.code(401).send({ error: 'Нужна корректная подпись события.' });
    return false;
  }

  const timestampMs = Date.parse(timestamp);
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > config.eventSignatureMaxSkewMs
  ) {
    reply.code(401).send({ error: 'Подпись события устарела.' });
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(eventSignaturePayload(type, event, timestamp))
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) {
    reply.code(401).send({ error: 'Недействительная подпись события.' });
    return false;
  }
  return true;
}

class EventDomainError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly reasons: string[] = [],
  ) {
    super(message);
  }
}

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';

export class DeveloperPayoutError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export async function requestDeveloperPayout(
  userId: string,
  amountKopecks: number,
  clientRequestId: string,
) {
  try {
    return await serializable(async (tx) => {
      const developer = await tx.developerProfile.findUnique({ where: { userId } });
      if (!developer) throw new DeveloperPayoutError('Профиль разработчика не найден.', 404);

      const existing = await tx.developerPayout.findUnique({
        where: {
          developerId_clientRequestId: { developerId: developer.id, clientRequestId },
        },
      });
      if (existing) {
        if (existing.amountKopecks !== amountKopecks) {
          throw new DeveloperPayoutError(
            'Этот идентификатор запроса уже использован для другой суммы.',
            409,
          );
        }
        return { payout: existing, created: false };
      }

      const openPayout = await tx.developerPayout.findFirst({
        where: { developerId: developer.id, status: 'requested' },
      });
      if (openPayout) {
        throw new DeveloperPayoutError(
          'Сначала дождитесь обработки текущей заявки или отмените ее.',
          409,
        );
      }

      const reserved = await tx.developerProfile.updateMany({
        where: { id: developer.id, balanceKopecks: { gte: amountKopecks } },
        data: {
          balanceKopecks: { decrement: amountKopecks },
          reservedKopecks: { increment: amountKopecks },
        },
      });
      if (reserved.count !== 1) {
        throw new DeveloperPayoutError('Недостаточно доступных средств для вывода.', 409);
      }

      const payout = await tx.developerPayout.create({
        data: {
          developerId: developer.id,
          clientRequestId,
          idempotenceKey: randomUUID(),
          amountKopecks,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          userId,
          payoutId: payout.id,
          type: 'payout_reserved',
          amountKopecks: -amountKopecks,
          description: 'Средства зарезервированы для выплаты разработчику',
        },
      });
      return { payout, created: true };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const developer = await prisma.developerProfile.findUnique({ where: { userId } });
      const existing = developer
        ? await prisma.developerPayout.findUnique({
            where: {
              developerId_clientRequestId: { developerId: developer.id, clientRequestId },
            },
          })
        : null;
      if (existing && existing.amountKopecks === amountKopecks) {
        return { payout: existing, created: false };
      }
      throw new DeveloperPayoutError('У разработчика уже есть заявка, ожидающая обработки.', 409);
    }
    throw error;
  }
}

export async function cancelDeveloperPayout(userId: string, payoutId: string) {
  return serializable(async (tx) => {
    const payout = await tx.developerPayout.findUnique({
      where: { id: payoutId },
      include: { developer: { select: { userId: true } } },
    });
    if (!payout || payout.developer.userId !== userId) {
      throw new DeveloperPayoutError('Заявка на выплату не найдена.', 404);
    }
    if (payout.status === 'canceled') return payout;
    if (payout.status !== 'requested') {
      throw new DeveloperPayoutError('Обработанную заявку отменить нельзя.', 409);
    }

    const changed = await tx.developerPayout.updateMany({
      where: { id: payout.id, status: 'requested' },
      data: { status: 'canceled', canceledAt: new Date() },
    });
    if (changed.count !== 1) {
      throw new DeveloperPayoutError('Статус заявки уже изменился. Обновите страницу.', 409);
    }
    await releaseReserve(tx, payout.developerId, userId, payout.id, payout.amountKopecks);
    return tx.developerPayout.findUniqueOrThrow({ where: { id: payout.id } });
  });
}

export async function markDeveloperPayoutPaid(
  adminId: string,
  payoutId: string,
  externalReference: string,
  reviewNote?: string,
) {
  return serializable(async (tx) => {
    const payout = await tx.developerPayout.findUnique({
      where: { id: payoutId },
      include: { developer: { select: { userId: true } } },
    });
    if (!payout) throw new DeveloperPayoutError('Заявка на выплату не найдена.', 404);
    if (payout.status === 'paid') {
      if (payout.externalReference !== externalReference) {
        throw new DeveloperPayoutError('Выплата уже подтверждена с другим номером перевода.', 409);
      }
      return payout;
    }
    if (payout.status !== 'requested') {
      throw new DeveloperPayoutError('Эту заявку уже нельзя отметить выплаченной.', 409);
    }

    const duplicateReference = await tx.developerPayout.findFirst({
      where: {
        provider: payout.provider,
        externalReference,
        id: { not: payout.id },
      },
      select: { id: true },
    });
    if (duplicateReference) {
      throw new DeveloperPayoutError('Этот номер перевода уже привязан к другой выплате.', 409);
    }

    const now = new Date();
    const changed = await tx.developerPayout.updateMany({
      where: { id: payout.id, status: 'requested' },
      data: {
        status: 'paid',
        externalReference,
        reviewNote,
        reviewedAt: now,
        paidAt: now,
      },
    });
    if (changed.count !== 1) {
      throw new DeveloperPayoutError('Статус заявки уже изменился. Обновите страницу.', 409);
    }
    const debited = await tx.developerProfile.updateMany({
      where: { id: payout.developerId, reservedKopecks: { gte: payout.amountKopecks } },
      data: {
        reservedKopecks: { decrement: payout.amountKopecks },
        paidKopecks: { increment: payout.amountKopecks },
      },
    });
    if (debited.count !== 1) {
      throw new DeveloperPayoutError('Резерв заявки поврежден. Выплата остановлена.', 409);
    }
    await tx.ledgerEntry.create({
      data: {
        userId: payout.developer.userId,
        payoutId: payout.id,
        type: 'payout_succeeded',
        amountKopecks: 0,
        description: 'Выплата разработчику подтверждена',
      },
    });
    await tx.adminAuditLog.create({
      data: {
        adminId,
        action: 'developer-payout.paid',
        targetType: 'developer-payout',
        targetId: payout.id,
        metadata: {
          amountKopecks: payout.amountKopecks,
          previousStatus: payout.status,
          nextStatus: 'paid',
        },
      },
    });
    return tx.developerPayout.findUniqueOrThrow({ where: { id: payout.id } });
  });
}

export async function rejectDeveloperPayout(adminId: string, payoutId: string, reason: string) {
  return serializable(async (tx) => {
    const payout = await tx.developerPayout.findUnique({
      where: { id: payoutId },
      include: { developer: { select: { userId: true } } },
    });
    if (!payout) throw new DeveloperPayoutError('Заявка на выплату не найдена.', 404);
    if (payout.status === 'rejected') return payout;
    if (payout.status !== 'requested') {
      throw new DeveloperPayoutError('Эту заявку уже нельзя отклонить.', 409);
    }

    const changed = await tx.developerPayout.updateMany({
      where: { id: payout.id, status: 'requested' },
      data: { status: 'rejected', reviewNote: reason, reviewedAt: new Date() },
    });
    if (changed.count !== 1) {
      throw new DeveloperPayoutError('Статус заявки уже изменился. Обновите страницу.', 409);
    }
    await releaseReserve(
      tx,
      payout.developerId,
      payout.developer.userId,
      payout.id,
      payout.amountKopecks,
    );
    await tx.adminAuditLog.create({
      data: {
        adminId,
        action: 'developer-payout.rejected',
        targetType: 'developer-payout',
        targetId: payout.id,
        metadata: {
          amountKopecks: payout.amountKopecks,
          previousStatus: payout.status,
          nextStatus: 'rejected',
          reason,
        },
      },
    });
    return tx.developerPayout.findUniqueOrThrow({ where: { id: payout.id } });
  });
}

async function releaseReserve(
  tx: Prisma.TransactionClient,
  developerId: string,
  userId: string,
  payoutId: string,
  amountKopecks: number,
) {
  const released = await tx.developerProfile.updateMany({
    where: { id: developerId, reservedKopecks: { gte: amountKopecks } },
    data: {
      reservedKopecks: { decrement: amountKopecks },
      balanceKopecks: { increment: amountKopecks },
    },
  });
  if (released.count !== 1) {
    throw new DeveloperPayoutError('Резерв заявки поврежден. Операция остановлена.', 409);
  }
  await tx.ledgerEntry.create({
    data: {
      userId,
      payoutId,
      type: 'payout_released',
      amountKopecks,
      description: 'Резерв выплаты возвращен на доступный баланс',
    },
  });
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isWriteConflict(error) && attempt < 2) continue;
      throw error;
    }
  }
  throw new DeveloperPayoutError('Не удалось завершить финансовую операцию.', 409);
}

function isWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

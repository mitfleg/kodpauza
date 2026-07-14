import { PendingTelemetryEvent } from './types';

export const MAX_PENDING_TELEMETRY = 2_000;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export function enqueueTelemetry(
  queue: readonly PendingTelemetryEvent[],
  item: PendingTelemetryEvent,
  limit = MAX_PENDING_TELEMETRY
): PendingTelemetryEvent[] {
  const withoutDuplicate = queue.filter((entry) => entry.id !== item.id);
  return [...withoutDuplicate, item].slice(-Math.max(1, limit));
}

export function acknowledgeTelemetry(
  queue: readonly PendingTelemetryEvent[],
  id: string
): PendingTelemetryEvent[] {
  return queue.filter((entry) => entry.id !== id);
}

export function deferTelemetry(
  queue: readonly PendingTelemetryEvent[],
  id: string,
  nowMs = Date.now()
): PendingTelemetryEvent[] {
  return queue.map((entry) => {
    if (entry.id !== id) {
      return entry;
    }

    const attempts = entry.attempts + 1;
    return {
      ...entry,
      attempts,
      nextAttemptAt: new Date(nowMs + retryDelayMs(attempts)).toISOString()
    };
  });
}

export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(10, attempts - 1));
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** exponent));
}

export function isPendingTelemetryEvent(value: unknown): value is PendingTelemetryEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<PendingTelemetryEvent>;
  return (
    typeof item.id === 'string' &&
    (item.type === 'impression' || item.type === 'click') &&
    typeof item.attempts === 'number' && Number.isInteger(item.attempts) && item.attempts >= 0 &&
    typeof item.createdAt === 'string' &&
    Number.isFinite(Date.parse(item.createdAt)) &&
    typeof item.nextAttemptAt === 'string' &&
    Number.isFinite(Date.parse(item.nextAttemptAt)) &&
    Boolean(item.event) &&
    item.event?.eventId === item.id
  );
}

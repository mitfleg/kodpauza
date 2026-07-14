import * as vscode from 'vscode';
import { KodpauzaApiClient, KodpauzaApiError } from './apiClient';
import { KodpauzaState } from './state';
import { KodpauzaEvent, KodpauzaEventType, PendingTelemetryEvent } from './types';

const FLUSH_INTERVAL_MS = 30_000;

export class TelemetryOutbox implements vscode.Disposable {
  private flushPromise: Promise<void> | undefined;
  private readonly interval: NodeJS.Timeout;

  constructor(
    private readonly api: KodpauzaApiClient,
    private readonly state: KodpauzaState
  ) {
    this.interval = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.interval.unref();
  }

  start(): void {
    void this.flush();
  }

  async enqueue(type: KodpauzaEventType, event: KodpauzaEvent): Promise<void> {
    const now = new Date().toISOString();
    const pending: PendingTelemetryEvent = {
      id: event.eventId,
      type,
      event,
      attempts: 0,
      createdAt: now,
      nextAttemptAt: now
    };

    await this.state.enqueueTelemetry(pending);
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    const run = this.flushPending();
    this.flushPromise = run;
    try {
      await run;
    } finally {
      if (this.flushPromise === run) {
        this.flushPromise = undefined;
      }
    }
  }

  dispose(): void {
    clearInterval(this.interval);
  }

  private async flushPending(): Promise<void> {
    if (!(await this.state.accessToken()) || !(await this.state.eventSecret())) {
      return;
    }

    const nowMs = Date.now();
    const pending = this.state.pendingTelemetry
      .filter((item) => Date.parse(item.nextAttemptAt) <= nowMs)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    for (const item of pending) {
      try {
        if (item.type === 'impression') {
          await this.api.sendImpression(item.event);
        } else {
          await this.api.sendClick(item.event);
        }
        await this.state.acknowledgeTelemetry(item.id);
      } catch (error) {
        const status = error instanceof KodpauzaApiError ? error.status : undefined;
        if (status && [400, 404, 409, 410, 422].includes(status)) {
          await this.state.acknowledgeTelemetry(item.id);
          continue;
        }

        await this.state.deferTelemetry(item.id);
        if (
          !(error instanceof KodpauzaApiError) ||
          !status ||
          status === 401 ||
          status === 403 ||
          status === 408 ||
          status === 429 ||
          status >= 500
        ) {
          break;
        }
      }
    }
  }
}

export type CountdownClock = {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimeout: (timer: NodeJS.Timeout) => void;
};

const systemClock: CountdownClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
};

export class PausableCountdown {
  private timer: NodeJS.Timeout | undefined;
  private remainingMsValue: number;
  private startedAt: number | undefined;

  constructor(
    private durationMs: number,
    private readonly onElapsed: () => void,
    private readonly clock: CountdownClock = systemClock
  ) {
    this.remainingMsValue = durationMs;
  }

  get isRunning(): boolean {
    return Boolean(this.timer);
  }

  get remainingMs(): number {
    if (this.startedAt === undefined) {
      return this.remainingMsValue;
    }
    return Math.max(0, this.remainingMsValue - (this.clock.now() - this.startedAt));
  }

  get deadlineAt(): number | undefined {
    return this.startedAt === undefined ? undefined : this.startedAt + this.remainingMsValue;
  }

  reset(durationMs = this.durationMs): void {
    this.clearTimer();
    this.durationMs = Math.max(1, durationMs);
    this.remainingMsValue = this.durationMs;
    this.startedAt = undefined;
  }

  resume(): void {
    if (this.timer || this.remainingMsValue <= 0) {
      return;
    }
    this.startedAt = this.clock.now();
    const timer = this.clock.setTimeout(() => {
      if (this.timer !== timer) {
        return;
      }
      this.timer = undefined;
      this.startedAt = undefined;
      this.remainingMsValue = 0;
      this.onElapsed();
    }, this.remainingMsValue);
    timer.unref?.();
    this.timer = timer;
  }

  pause(): void {
    if (!this.timer || this.startedAt === undefined) {
      return;
    }
    this.remainingMsValue = Math.max(
      0,
      this.remainingMsValue - (this.clock.now() - this.startedAt)
    );
    this.clearTimer();
    this.startedAt = undefined;
  }

  cancel(): void {
    this.clearTimer();
    this.startedAt = undefined;
    this.remainingMsValue = this.durationMs;
  }

  private clearTimer(): void {
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}

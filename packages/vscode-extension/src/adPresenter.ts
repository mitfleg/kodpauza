import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { KodpauzaApiClient } from './apiClient';
import { KodpauzaState } from './state';
import { TelemetryOutbox } from './telemetryOutbox';
import { AdPlacement, KodpauzaAd, KodpauzaEvent, KodpauzaEventType } from './types';
import { PausableCountdown } from './pausableCountdown';

const IMPRESSION_THRESHOLD_MS = 5_000;
const LOCAL_QUEUE_RETRY_MS = 30_000;
export const AD_ROTATION_INTERVAL_MS = 30_000;

export class StatusBarAdPresenter implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private currentAd: KodpauzaAd | undefined;
  private visible = false;
  private running = false;
  private impressionQueued = false;
  private clickQueued = false;
  private visibleStartedAt: number | undefined;
  private accumulatedVisibleMs = 0;
  private impressionTimer: NodeJS.Timeout | undefined;
  private loadController: AbortController | undefined;
  private generation = 0;
  private placement: AdPlacement | undefined;
  private patchedUiEnabled = false;
  private readonly patchedUiViews = new Map<string, number>();
  private patchedUiVisibilityTimer: NodeJS.Timeout | undefined;
  private readonly rotationClock: PausableCountdown;
  private sessionIdValue: string | undefined;
  private sessionStartedAtValue: string | undefined;

  constructor(
    private readonly api: KodpauzaApiClient,
    private readonly state: KodpauzaState,
    private readonly outbox: TelemetryOutbox,
    private readonly clientVersion: string,
    itemId = 'kodpauza.ad',
    private readonly allowStatusBarFallback = false,
    rotationIntervalMs = AD_ROTATION_INTERVAL_MS
  ) {
    this.rotationClock = new PausableCountdown(
      rotationIntervalMs,
      () => void this.rotateAd()
    );
    this.item = vscode.window.createStatusBarItem(itemId, vscode.StatusBarAlignment.Right, 97);
    this.item.name = 'Kodpauza: рекламная пауза';
    this.item.tooltip = 'Kodpauza: ожидание запуска';

    this.disposables.push(
      this.item,
      vscode.window.onDidChangeWindowState((windowState) => {
        if (windowState.focused) {
          this.resumeVisibility();
        } else {
          this.clearPatchedUiVisibility();
          this.pauseVisibility();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration('workbench.statusBar.visible')) {
          return;
        }

        if (this.presentationSurfaceAvailable) {
          this.resumeVisibility();
        } else {
          this.pauseVisibility();
        }
      })
    );
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isVisible(): boolean {
    return this.visible && this.presentationSurfaceAvailable;
  }

  get hasActiveWindow(): boolean {
    return vscode.window.state.focused;
  }

  get ad(): KodpauzaAd | undefined {
    return this.currentAd;
  }

  get sessionId(): string | undefined {
    return this.sessionIdValue;
  }

  get sessionStartedAt(): string | undefined {
    return this.sessionStartedAtValue;
  }

  get nextRotationAt(): string | undefined {
    const deadlineAt = this.rotationClock.deadlineAt;
    return deadlineAt === undefined ? undefined : new Date(deadlineAt).toISOString();
  }

  setPatchedUiEnabled(value: boolean): void {
    this.patchedUiEnabled = value;
    if (!value) {
      this.clearPatchedUiVisibility();
    }
    if (value) {
      this.item.hide();
    } else if (this.allowStatusBarFallback && this.visible && this.currentAd) {
      this.showCurrentAdInStatusBar();
    }
    if (this.presentationSurfaceAvailable) {
      this.resumeVisibility();
    } else if (!this.currentAd) {
      this.resumeEmptyAdRetry();
    } else {
      this.pauseVisibility();
    }
  }

  markPatchedUiVisibility(adId: string, viewId: string, visible: boolean): void {
    if (
      !this.patchedUiEnabled ||
      !this.running ||
      !this.visible ||
      this.currentAd?.adId !== adId ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(viewId)
    ) {
      return;
    }
    if (visible) {
      this.patchedUiViews.set(viewId, Date.now() + 1_500);
    } else {
      this.patchedUiViews.delete(viewId);
    }
    this.refreshPatchedUiVisibility();
  }

  async startWait(placement: AdPlacement): Promise<void> {
    if (this.running && this.placement?.surface === placement.surface) {
      this.placement = placement;
      return;
    }

    const generation = ++this.generation;
    this.loadController?.abort();
    this.rotationClock.cancel();
    this.resetExposure();
    this.running = true;
    this.placement = placement;
    this.sessionIdValue = crypto.randomUUID();
    this.sessionStartedAtValue = new Date().toISOString();

    if (!this.state.adsEnabled || !this.state.integrationEnabled) {
      this.running = false;
      this.placement = undefined;
      this.clearSession();
      this.hideItem();
      return;
    }

    if (!this.patchedUiEnabled && !this.allowStatusBarFallback) {
      this.running = false;
      this.placement = undefined;
      this.clearSession();
      this.hideItem();
      return;
    }

    if (!this.patchedUiEnabled && this.allowStatusBarFallback) {
      this.item.text = `$(loading~spin) ${placement.waitingLabel}`;
      this.item.tooltip = 'Реклама появится после загрузки безопасного объявления.';
      this.item.command = undefined;
      this.item.show();
    }

    try {
      await this.loadAd(generation);
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      this.running = false;
      this.placement = undefined;
      this.clearSession();
      this.hideItem();
      throw error;
    }
  }

  stopWait(): void {
    this.generation += 1;
    this.loadController?.abort();
    this.loadController = undefined;
    this.running = false;
    this.rotationClock.cancel();
    this.resetExposure();
    this.placement = undefined;
    this.clearSession();
    this.hideItem();
  }

  async recordClick(): Promise<boolean> {
    const ad = this.currentAd;
    if (
      !ad ||
      !this.visible ||
      !this.running ||
      !this.presentationSurfaceAvailable ||
      !this.state.adsEnabled ||
      !this.state.integrationEnabled
    ) {
      return false;
    }

    if (!this.clickQueued) {
      this.clickQueued = true;
      try {
        await this.queueEvent('click', ad);
      } catch (error) {
        this.clickQueued = false;
        throw error;
      }
    }

    return true;
  }

  dispose(): void {
    this.stopWait();
    this.clearPatchedUiVisibility();
    vscode.Disposable.from(...this.disposables).dispose();
  }

  private get statusBarEnabled(): boolean {
    return vscode.workspace.getConfiguration('workbench').get<boolean>('statusBar.visible', true);
  }

  private get presentationSurfaceAvailable(): boolean {
    return this.patchedUiEnabled
      ? [...this.patchedUiViews.values()].some((expiresAt) => expiresAt > Date.now())
      : this.allowStatusBarFallback && this.statusBarEnabled;
  }

  get canRenderPatchedUi(): boolean {
    return (
      this.patchedUiEnabled &&
      this.visible &&
      this.running &&
      Boolean(this.currentAd) &&
      vscode.window.state.focused &&
      this.state.adsEnabled &&
      this.state.integrationEnabled
    );
  }

  private isCurrentGeneration(generation: number): boolean {
    return (
      generation === this.generation &&
      this.running &&
      this.state.adsEnabled &&
      this.state.integrationEnabled
    );
  }

  private async loadAd(generation: number): Promise<void> {
    const placement = this.placement;
    if (!placement || !this.isCurrentGeneration(generation)) {
      return;
    }

    this.loadController?.abort();
    const controller = new AbortController();
    this.loadController = controller;
    this.rotationClock.pause();
    this.resetExposure();

    if (!this.patchedUiEnabled && this.allowStatusBarFallback) {
      this.item.text = `$(loading~spin) ${placement.waitingLabel}`;
      this.item.tooltip = 'Реклама появится после загрузки безопасного объявления.';
      this.item.command = undefined;
      this.item.show();
    }

    try {
      const ad = await this.api.currentAd(placement.surface, controller.signal);
      if (!this.isCurrentGeneration(generation) || this.loadController !== controller) {
        return;
      }

      if (!ad) {
        this.hideItem();
        this.rotationClock.reset();
        this.resumeEmptyAdRetry();
        return;
      }

      this.currentAd = ad;
      if (this.patchedUiEnabled) {
        this.item.hide();
      } else if (this.allowStatusBarFallback) {
        this.showCurrentAdInStatusBar();
      }
      this.visible = true;
      this.rotationClock.reset();
      this.resumeVisibility();
    } finally {
      if (this.loadController === controller) {
        this.loadController = undefined;
      }
    }
  }

  private async rotateAd(): Promise<void> {
    const generation = this.generation;
    if (!this.isCurrentGeneration(generation) || !this.placement) {
      return;
    }

    try {
      await this.loadAd(generation);
    } catch {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }
      this.hideItem();
      this.rotationClock.reset();
      this.resumeEmptyAdRetry();
    }
  }

  private resumeEmptyAdRetry(): void {
    if (
      this.currentAd ||
      !this.running ||
      !this.placement ||
      !vscode.window.state.focused ||
      !this.state.adsEnabled ||
      !this.state.integrationEnabled ||
      (!this.patchedUiEnabled && !this.allowStatusBarFallback)
    ) {
      return;
    }
    this.rotationClock.resume();
  }

  private clearSession(): void {
    this.sessionIdValue = undefined;
    this.sessionStartedAtValue = undefined;
  }

  private resetExposure(): void {
    this.clearPatchedUiVisibility();
    this.pauseVisibility();
    this.currentAd = undefined;
    this.visible = false;
    this.impressionQueued = false;
    this.clickQueued = false;
    this.accumulatedVisibleMs = 0;
    this.visibleStartedAt = undefined;
    this.item.command = undefined;
  }

  private hideItem(): void {
    this.pauseVisibility();
    this.visible = false;
    this.item.hide();
  }

  private resumeVisibility(): void {
    if (!this.canAccumulateVisibility) {
      if (!this.currentAd) {
        this.resumeEmptyAdRetry();
      }
      return;
    }

    this.rotationClock.resume();
    if (this.impressionQueued) {
      return;
    }

    if (this.visibleStartedAt === undefined) {
      this.visibleStartedAt = Date.now();
    }

    this.scheduleImpressionCheck();
  }

  private pauseVisibility(): void {
    this.rotationClock.pause();
    this.visibleStartedAt = undefined;
    this.accumulatedVisibleMs = 0;
    this.clearImpressionTimer();
  }

  private get canAccumulateVisibility(): boolean {
    return (
      this.visible &&
      this.running &&
      Boolean(this.currentAd) &&
      vscode.window.state.focused &&
      this.presentationSurfaceAvailable &&
      this.state.adsEnabled &&
      this.state.integrationEnabled
    );
  }

  private scheduleImpressionCheck(): void {
    this.clearImpressionTimer();
    const remainingMs = Math.max(0, this.impressionThresholdMs - this.currentVisibilityMs());
    this.impressionTimer = setTimeout(() => void this.maybeQueueImpression(), remainingMs);
  }

  private async maybeQueueImpression(): Promise<void> {
    const ad = this.currentAd;
    if (!ad || !this.canAccumulateVisibility || this.impressionQueued) {
      return;
    }

    const visibleMs = this.currentVisibilityMs();
    if (visibleMs < this.impressionThresholdMs) {
      this.scheduleImpressionCheck();
      return;
    }

    this.impressionQueued = true;
    try {
      await this.queueEvent('impression', ad, visibleMs);
    } catch {
      this.impressionQueued = false;
      this.clearImpressionTimer();
      this.impressionTimer = setTimeout(() => void this.maybeQueueImpression(), LOCAL_QUEUE_RETRY_MS);
    }
  }

  private currentVisibilityMs(): number {
    const activeSlice = this.visibleStartedAt === undefined ? 0 : Date.now() - this.visibleStartedAt;
    return this.accumulatedVisibleMs + activeSlice;
  }

  private get impressionThresholdMs(): number {
    return Math.max(IMPRESSION_THRESHOLD_MS, (this.currentAd?.durationSec ?? 5) * 1000);
  }

  private async queueEvent(type: KodpauzaEventType, ad: KodpauzaAd, visibleMs?: number): Promise<void> {
    if (ad.trackable === false || ad.campaignId === 'house') {
      return;
    }

    const placement = this.placement;
    if (!placement || placement.surface !== ad.surface) {
      return;
    }

    const event: KodpauzaEvent = {
      eventId: crypto.randomUUID(),
      adId: ad.adId,
      campaignId: ad.campaignId,
      surface: placement.surface,
      visibleMs,
      clientVersion: this.clientVersion,
      toolName: placement.toolName,
      toolVersion: placement.toolVersion
    };

    await this.outbox.enqueue(type, event);
  }

  private clearImpressionTimer(): void {
    if (this.impressionTimer) {
      clearTimeout(this.impressionTimer);
      this.impressionTimer = undefined;
    }
  }

  private clearPatchedUiVisibility(): void {
    if (this.patchedUiVisibilityTimer) {
      clearTimeout(this.patchedUiVisibilityTimer);
      this.patchedUiVisibilityTimer = undefined;
    }
    this.patchedUiViews.clear();
  }

  private refreshPatchedUiVisibility(): void {
    const now = Date.now();
    for (const [viewId, expiresAt] of this.patchedUiViews) {
      if (expiresAt <= now) {
        this.patchedUiViews.delete(viewId);
      }
    }
    if (this.patchedUiVisibilityTimer) {
      clearTimeout(this.patchedUiVisibilityTimer);
      this.patchedUiVisibilityTimer = undefined;
    }
    const nextExpiry = Math.min(...this.patchedUiViews.values());
    if (Number.isFinite(nextExpiry)) {
      this.patchedUiVisibilityTimer = setTimeout(
        () => this.refreshPatchedUiVisibility(),
        Math.max(1, nextExpiry - now + 10)
      );
      this.patchedUiVisibilityTimer.unref();
    }
    if (this.presentationSurfaceAvailable) {
      this.resumeVisibility();
    } else {
      this.pauseVisibility();
    }
  }

  private showCurrentAdInStatusBar(): void {
    const ad = this.currentAd;
    if (!ad) {
      return;
    }
    this.item.text = `$(megaphone) ${ad.text}`;
    this.item.tooltip = `Реклама · ${ad.advertiserName}${ad.erid ? ` · erid: ${ad.erid}` : ''}. Нажмите, чтобы открыть предложение.`;
    this.item.command = 'kodpauza.openAd';
    this.item.show();
  }
}

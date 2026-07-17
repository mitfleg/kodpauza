export type KodpauzaEventType = 'impression' | 'click';

export interface KodpauzaAd {
  adId: string;
  campaignId: string;
  text: string;
  url: string;
  erid: string | null;
  advertiserName: string;
  durationSec: number;
  surface: Surface;
  trackable: boolean;
  format: CampaignFormat;
}

export interface KodpauzaEvent {
  eventId: string;
  adId: string;
  campaignId: string;
  surface: Surface;
  visibleMs?: number;
  clientVersion: string;
  toolName: string;
  toolVersion: string;
}

export interface AdPlacement {
  surface: Surface;
  toolName: string;
  toolVersion: string;
  waitingLabel: string;
}

export interface PendingTelemetryEvent {
  id: string;
  type: KodpauzaEventType;
  event: KodpauzaEvent;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
}

export interface Balance {
  balanceKopecks: number;
  totalImpressions: number;
  totalClicks: number;
  payoutStatus: string;
}

export type Surface = 'claude_code_vscode' | 'codex_vscode';
export type CampaignFormat = 'standard' | 'premium';

export interface PatchBackup {
  adsEnabled: boolean | undefined;
  integrationEnabled?: boolean;
  patchInstalled?: boolean;
  createdAt: string;
}

export interface DiagnosticsSnapshot {
  apiBaseUrl: string;
  dashboardUrl: string;
  hasToken: boolean;
  hasEventSecret: boolean;
  adsEnabled: boolean;
  integrationEnabled: boolean;
  adPresenterRunning: boolean;
  adVisible: boolean;
  activeWindow: boolean;
  lastEventAt?: string;
  lastError?: string;
  bridgeError?: string;
  pendingTelemetry: number;
  codexExtensionDetected: boolean;
  codexExtensionVersion?: string;
  codexHooksInstalled: boolean;
  codexBridgeListening: boolean;
  codexActiveTurns: number;
  claudeExtensionDetected: boolean;
  claudeExtensionVersion?: string;
  claudeHooksInstalled: boolean;
  claudeActiveTurns: number;
}

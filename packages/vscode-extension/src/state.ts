import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import {
  acknowledgeTelemetry,
  deferTelemetry,
  enqueueTelemetry,
  isPendingTelemetryEvent,
  MAX_PENDING_TELEMETRY
} from './telemetry';
import { PatchBackup, PendingTelemetryEvent } from './types';

const ACCESS_TOKEN_KEY = 'kodpauza.accessToken';
const REFRESH_TOKEN_KEY = 'kodpauza.refreshToken';
const EVENT_SECRET_KEY = 'kodpauza.eventSecret';
const INTEGRATION_ENABLED_KEY = 'kodpauza.integrationsEnabled';
const LEGACY_CODEX_INTEGRATION_ENABLED_KEY = 'kodpauza.codexIntegrationEnabled';
const LEGACY_PATCH_INSTALLED_KEY = 'kodpauza.patchEnabled';
const PATCH_BACKUP_KEY = 'kodpauza.patchBackup';
const ADS_ENABLED_KEY = 'kodpauza.adsEnabled';
const AUTO_CONNECT_INTEGRATIONS_KEY = 'kodpauza.autoConnectIntegrations';
const TELEMETRY_OUTBOX_KEY = 'kodpauza.telemetryOutbox.v1';
const LAST_UNSUPPORTED_CODEX_VERSION_KEY = 'kodpauza.lastUnsupportedCodexVersion';
const LAST_UNSUPPORTED_INTEGRATION_VERSIONS_KEY = 'kodpauza.lastUnsupportedIntegrationVersions';
const INSTALL_ID_KEY = 'kodpauza.installId';

export type IntegrationStateTool = 'codex' | 'claude';

export class KodpauzaState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    await this.migrateLegacyFlag(ADS_ENABLED_KEY);
    await this.migrateLegacyIntegrationFlag();
    await this.migrateAutomaticIntegrationPreference();
  }

  get installId(): string {
    const existing = this.context.globalState.get<string>(INSTALL_ID_KEY);
    if (existing) return existing;
    const created = randomUUID();
    void this.context.globalState.update(INSTALL_ID_KEY, created);
    return created;
  }

  get adsEnabled(): boolean {
    return vscode.workspace.getConfiguration('kodpauza').get<boolean>('adsEnabled', false);
  }

  async setAdsEnabled(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration('kodpauza')
      .update('adsEnabled', value, vscode.ConfigurationTarget.Global);
  }

  get autoConnectIntegrations(): boolean {
    return vscode.workspace
      .getConfiguration('kodpauza')
      .get<boolean>('autoConnectIntegrations', true);
  }

  async setAutoConnectIntegrations(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration('kodpauza')
      .update(
        AUTO_CONNECT_INTEGRATIONS_KEY.slice('kodpauza.'.length),
        value,
        vscode.ConfigurationTarget.Global
      );
  }

  get integrationEnabled(): boolean {
    const configuration = vscode.workspace.getConfiguration('kodpauza');
    return configuration.get<boolean>('integrationsEnabled')
      ?? configuration.get<boolean>('codexIntegrationEnabled', false);
  }

  async setIntegrationEnabled(value: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration('kodpauza')
      .update('integrationsEnabled', value, vscode.ConfigurationTarget.Global);
  }

  get patchBackup(): PatchBackup | undefined {
    return this.context.globalState.get<PatchBackup>(PATCH_BACKUP_KEY);
  }

  async savePatchBackup(): Promise<PatchBackup> {
    const backup: PatchBackup = {
      adsEnabled: vscode.workspace.getConfiguration('kodpauza').get<boolean>('adsEnabled'),
      integrationEnabled: this.integrationEnabled,
      createdAt: new Date().toISOString()
    };

    await this.context.globalState.update(PATCH_BACKUP_KEY, backup);
    return backup;
  }

  async restorePatchBackup(): Promise<void> {
    const backup = this.patchBackup;
    if (!backup) {
      throw new Error('Резервная копия настроек Kodpauza не найдена.');
    }

    await this.setIntegrationEnabled(backup.integrationEnabled ?? backup.patchInstalled ?? false);
    if (typeof backup.adsEnabled === 'boolean') {
      await this.setAdsEnabled(backup.adsEnabled);
    } else {
      await vscode.workspace
        .getConfiguration('kodpauza')
        .update('adsEnabled', undefined, vscode.ConfigurationTarget.Global);
    }
  }

  async accessToken(): Promise<string | undefined> {
    return this.context.secrets.get(ACCESS_TOKEN_KEY);
  }

  async setAccessToken(token: string): Promise<void> {
    await this.context.secrets.store(ACCESS_TOKEN_KEY, token);
  }

  async refreshToken(): Promise<string | undefined> {
    return this.context.secrets.get(REFRESH_TOKEN_KEY);
  }

  async eventSecret(): Promise<string | undefined> {
    return this.context.secrets.get(EVENT_SECRET_KEY);
  }

  async setEventSecret(secret: string): Promise<void> {
    await this.context.secrets.store(EVENT_SECRET_KEY, secret);
  }

  async setAuthSession(accessToken: string, refreshToken: string, eventSecret: string): Promise<void> {
    await Promise.all([
      this.context.secrets.store(ACCESS_TOKEN_KEY, accessToken),
      this.context.secrets.store(REFRESH_TOKEN_KEY, refreshToken),
      this.context.secrets.store(EVENT_SECRET_KEY, eventSecret)
    ]);
  }

  async clearAuthSession(): Promise<void> {
    await Promise.all([
      this.context.secrets.delete(ACCESS_TOKEN_KEY),
      this.context.secrets.delete(REFRESH_TOKEN_KEY),
      this.context.secrets.delete(EVENT_SECRET_KEY)
    ]);
  }

  async clearAccessToken(): Promise<void> {
    await this.clearAuthSession();
  }

  get pendingTelemetry(): PendingTelemetryEvent[] {
    const stored = this.context.globalState.get<unknown[]>(TELEMETRY_OUTBOX_KEY, []);
    return stored.filter(isPendingTelemetryEvent);
  }

  async enqueueTelemetry(item: PendingTelemetryEvent): Promise<void> {
    const pending = this.pendingTelemetry;
    if (pending.length >= MAX_PENDING_TELEMETRY && !pending.some((entry) => entry.id === item.id)) {
      throw new Error('Локальная очередь событий Kodpauza заполнена. Запустите диагностику.');
    }

    await this.context.globalState.update(
      TELEMETRY_OUTBOX_KEY,
      enqueueTelemetry(pending, item)
    );
  }

  async acknowledgeTelemetry(id: string): Promise<void> {
    await this.context.globalState.update(
      TELEMETRY_OUTBOX_KEY,
      acknowledgeTelemetry(this.pendingTelemetry, id)
    );
  }

  async deferTelemetry(id: string, nowMs = Date.now()): Promise<void> {
    await this.context.globalState.update(
      TELEMETRY_OUTBOX_KEY,
      deferTelemetry(this.pendingTelemetry, id, nowMs)
    );
  }

  async clearTelemetry(): Promise<void> {
    await this.context.globalState.update(TELEMETRY_OUTBOX_KEY, undefined);
  }

  get lastUnsupportedCodexVersion(): string | undefined {
    return this.lastUnsupportedIntegrationVersion('codex');
  }

  async markUnsupportedCodexVersion(version: string): Promise<void> {
    await this.markUnsupportedIntegrationVersion('codex', version);
  }

  lastUnsupportedIntegrationVersion(tool: IntegrationStateTool): string | undefined {
    const values = this.context.globalState.get<Partial<Record<IntegrationStateTool, string>>>(
      LAST_UNSUPPORTED_INTEGRATION_VERSIONS_KEY,
      {}
    );
    return values[tool]
      ?? (tool === 'codex'
        ? this.context.globalState.get<string>(LAST_UNSUPPORTED_CODEX_VERSION_KEY)
        : undefined);
  }

  async markUnsupportedIntegrationVersion(tool: IntegrationStateTool, version: string): Promise<void> {
    const values = this.context.globalState.get<Partial<Record<IntegrationStateTool, string>>>(
      LAST_UNSUPPORTED_INTEGRATION_VERSIONS_KEY,
      {}
    );
    await this.context.globalState.update(LAST_UNSUPPORTED_INTEGRATION_VERSIONS_KEY, {
      ...values,
      [tool]: version
    });
    if (tool === 'codex') {
      await this.context.globalState.update(LAST_UNSUPPORTED_CODEX_VERSION_KEY, undefined);
    }
  }

  private async migrateLegacyFlag(fullKey: string): Promise<void> {
    const setting = fullKey.slice('kodpauza.'.length);
    const configuration = vscode.workspace.getConfiguration('kodpauza');
    const inspected = configuration.inspect<boolean>(setting);
    const legacyValue = this.context.globalState.get<boolean>(fullKey);

    if (inspected?.globalValue === undefined && legacyValue !== undefined) {
      await configuration.update(setting, legacyValue, vscode.ConfigurationTarget.Global);
    }

    await this.context.globalState.update(fullKey, undefined);
  }

  private async migrateLegacyIntegrationFlag(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('kodpauza');
    const current = configuration.inspect<boolean>('integrationsEnabled');
    const legacyCodexConfiguration = configuration.inspect<boolean>('codexIntegrationEnabled');
    const legacyConfiguration = configuration.inspect<boolean>('patchEnabled');
    const legacyState = this.context.globalState.get<boolean>(LEGACY_PATCH_INSTALLED_KEY);

    if (current?.globalValue === undefined) {
      const legacyValue = legacyCodexConfiguration?.globalValue ?? legacyConfiguration?.globalValue ?? legacyState;
      if (legacyValue !== undefined) {
        await configuration.update(
          INTEGRATION_ENABLED_KEY.slice('kodpauza.'.length),
          legacyValue,
          vscode.ConfigurationTarget.Global
        );
      }
    }

    await this.context.globalState.update(LEGACY_PATCH_INSTALLED_KEY, undefined);
    if (legacyCodexConfiguration?.globalValue !== undefined) {
      await configuration.update(
        LEGACY_CODEX_INTEGRATION_ENABLED_KEY.slice('kodpauza.'.length),
        undefined,
        vscode.ConfigurationTarget.Global
      );
    }
  }

  private async migrateAutomaticIntegrationPreference(): Promise<void> {
    const configuration = vscode.workspace.getConfiguration('kodpauza');
    const automatic = configuration.inspect<boolean>('autoConnectIntegrations');
    const integration = configuration.inspect<boolean>('integrationsEnabled');

    if (automatic?.globalValue === undefined && integration?.globalValue === false) {
      await this.setAutoConnectIntegrations(false);
    }
  }
}

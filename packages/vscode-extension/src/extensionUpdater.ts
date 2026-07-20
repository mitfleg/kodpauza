import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { KodpauzaApiClient } from './apiClient';
import { defaultKodpauzaHome } from './codexHookInstaller';
import {
  editorInstallMarkerKey,
  isNewerExtensionVersion,
  verifyExtensionUpdateEnvelope,
} from './extensionUpdate';
import { isLocalRuntimePolicyUrl } from './runtimePolicy';

const MAX_VSIX_BYTES = 25 * 1024 * 1024;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 15_000;
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PROMPT_STATE_KEY = 'kodpauza.extensionUpdate.lastPrompt.v1';

type PromptState = { version: string; promptedAt: number };

export class ExtensionUpdater {
  private operation: Promise<void> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: KodpauzaApiClient,
    private readonly currentVersion: string,
  ) {}

  start(): void {
    const startupTimer = setTimeout(() => void this.check(false), STARTUP_CHECK_DELAY_MS);
    startupTimer.unref();
    const interval = setInterval(() => void this.check(false), UPDATE_CHECK_INTERVAL_MS);
    interval.unref();
    this.context.subscriptions.push(
      { dispose: () => clearTimeout(startupTimer) },
      { dispose: () => clearInterval(interval) },
    );
  }

  check(manual: boolean): Promise<void> {
    if (this.operation) return this.operation;
    const operation = this.runCheck(manual).finally(() => {
      if (this.operation === operation) this.operation = undefined;
    });
    this.operation = operation;
    return operation;
  }

  private async runCheck(manual: boolean): Promise<void> {
    if (!manual && !(await this.isFallbackInstall())) return;
    try {
      const manifest = verifyExtensionUpdateEnvelope(await this.api.extensionUpdate(), {
        trustedBaseUrl: this.api.apiBaseUrl,
        allowUnsignedLocalDevelopment: isLocalRuntimePolicyUrl(this.api.apiBaseUrl),
      });
      if (!isNewerExtensionVersion(manifest.version, this.currentVersion)) {
        if (manual) {
          await vscode.window.showInformationMessage(
            `Установлена актуальная версия Kodpauza ${this.currentVersion}.`,
          );
        }
        return;
      }

      if (!manual && !this.shouldPrompt(manifest.version)) return;
      await this.context.globalState.update(PROMPT_STATE_KEY, {
        version: manifest.version,
        promptedAt: Date.now(),
      } satisfies PromptState);
      const action = await vscode.window.showInformationMessage(
        `Доступна Kodpauza ${manifest.version}. Пакет подписан и будет проверен перед установкой.`,
        'Обновить',
        'Позже',
      );
      if (action !== 'Обновить') return;

      const vsix = await this.downloadVerifiedVsix(manifest.downloadUrl, manifest.sha256);
      const updateDirectory = vscode.Uri.joinPath(this.context.globalStorageUri, 'updates');
      await vscode.workspace.fs.createDirectory(updateDirectory);
      const vsixUri = vscode.Uri.joinPath(updateDirectory, `kodpauza-${manifest.version}.vsix`);
      await vscode.workspace.fs.writeFile(vsixUri, vsix);
      await this.cacheVerifiedVsix(manifest.version, vsix);
      await this.installWithRollback(vsixUri);
      const reload = await vscode.window.showInformationMessage(
        `Kodpauza ${manifest.version} установлена. Перезапустить окно редактора?`,
        'Перезапустить',
      );
      if (reload === 'Перезапустить') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      if (manual) {
        await vscode.window.showErrorMessage(
          `Не удалось проверить обновление Kodpauza: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private shouldPrompt(version: string): boolean {
    const state = this.context.globalState.get<PromptState>(PROMPT_STATE_KEY);
    return (
      !state || state.version !== version || Date.now() - state.promptedAt >= PROMPT_COOLDOWN_MS
    );
  }

  private async isFallbackInstall(): Promise<boolean> {
    const key = editorInstallMarkerKey(vscode.env.appName);
    try {
      await fs.access(path.join(defaultKodpauzaHome(), 'install-sources', `${key}.vsix`));
      return true;
    } catch {
      return false;
    }
  }

  private async installWithRollback(vsixUri: vscode.Uri): Promise<void> {
    const previousPath = path.join(
      defaultKodpauzaHome(),
      'update-cache',
      `kodpauza-${this.currentVersion}.vsix`,
    );
    try {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', vsixUri);
    } catch (error) {
      try {
        await fs.access(previousPath);
        await vscode.commands.executeCommand(
          'workbench.extensions.installExtension',
          vscode.Uri.file(previousPath),
        );
      } catch (rollbackError) {
        throw new Error(
          `установка не удалась; автоматический откат тоже не выполнен: ${
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          }`,
          { cause: error },
        );
      }
      throw new Error('установка не удалась, предыдущая версия восстановлена', { cause: error });
    }
  }

  private async cacheVerifiedVsix(version: string, bytes: Uint8Array): Promise<void> {
    const cacheDirectory = path.join(defaultKodpauzaHome(), 'update-cache');
    await fs.mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(cacheDirectory, `kodpauza-${version}.vsix`), bytes, {
      mode: 0o600,
    });
  }

  private async downloadVerifiedVsix(url: string, expectedSha256: string): Promise<Uint8Array> {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/octet-stream' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`сервер вернул HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_VSIX_BYTES) {
      throw new Error('пакет обновления превышает допустимый размер');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_VSIX_BYTES) {
      throw new Error('пакет обновления пуст или превышает допустимый размер');
    }
    const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(actualSha256), Buffer.from(expectedSha256))) {
      throw new Error('контрольная сумма пакета не совпала');
    }
    return bytes;
  }
}

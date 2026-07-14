import * as vscode from 'vscode';
import { KodpauzaApiClient } from './apiClient';
import { CodexHookBridge } from './codexBridge';
import { CodexHookInstaller } from './codexHookInstaller';
import { ClaudeHookInstaller } from './claudeHookInstaller';
import { ClaudePatchInstaller } from './claudePatchInstaller';
import {
  ClaudeLifecycleController,
  CodexLifecycleController,
  detectClaudeExtension,
  detectCodexExtension
} from './codexLifecycle';
import { CodexPatchInstaller } from './codexPatchInstaller';
import { StatusBarAdPresenter } from './adPresenter';
import { KodpauzaState } from './state';
import { DiagnosticsSnapshot } from './types';
import { createToolAdapters } from './adapters';

export class DiagnosticsReporter {
  private readonly output = vscode.window.createOutputChannel('Диагностика Kodpauza');

  constructor(
    private readonly api: KodpauzaApiClient,
    private readonly state: KodpauzaState,
    private readonly presenters: { codex: StatusBarAdPresenter; claude: StatusBarAdPresenter },
    private readonly bridge: CodexHookBridge,
    private readonly lifecycles: { codex: CodexLifecycleController; claude: ClaudeLifecycleController },
    private readonly hookInstallers: { codex: CodexHookInstaller; claude: ClaudeHookInstaller },
    private readonly patchInstallers: { codex?: CodexPatchInstaller; claude?: ClaudePatchInstaller }
  ) {}

  async run(): Promise<void> {
    const hasToken = Boolean(await this.state.accessToken());
    const hasEventSecret = Boolean(await this.state.eventSecret());
    const codex = detectCodexExtension();
    const claude = detectClaudeExtension();
    const [codexHooks, claudeHooks, codexPatch, claudePatch] = await Promise.all([
      inspectSafely(() => this.hookInstallers.codex.inspect()),
      inspectSafely(() => this.hookInstallers.claude.inspect()),
      inspectSafely(async () => this.patchInstallers.codex?.inspect()),
      inspectSafely(async () => this.patchInstallers.claude?.inspect())
    ]);
    const snapshot: DiagnosticsSnapshot = {
      apiBaseUrl: diagnosticValue(() => this.api.apiBaseUrl),
      dashboardUrl: diagnosticValue(() => this.api.dashboardUrl),
      hasToken,
      hasEventSecret,
      adsEnabled: this.state.adsEnabled,
      integrationEnabled: this.state.integrationEnabled,
      adPresenterRunning: this.presenters.codex.isRunning || this.presenters.claude.isRunning,
      adVisible: this.presenters.codex.isVisible || this.presenters.claude.isVisible,
      activeWindow: this.presenters.codex.hasActiveWindow,
      lastEventAt: this.api.lastEventAt,
      lastError: this.api.lastError,
      bridgeError: this.bridge.lastError,
      pendingTelemetry: this.state.pendingTelemetry.length,
      codexExtensionDetected: codex.detected,
      codexExtensionVersion: codex.version,
      codexHooksInstalled: Boolean(codexHooks.value?.installed),
      codexBridgeListening: this.bridge.isListening,
      codexActiveTurns: this.lifecycles.codex.activeTurns,
      claudeExtensionDetected: claude.detected,
      claudeExtensionVersion: claude.version,
      claudeHooksInstalled: Boolean(claudeHooks.value?.installed),
      claudeActiveTurns: this.lifecycles.claude.activeTurns
    };

    this.output.clear();
    this.output.appendLine('Диагностика Kodpauza');
    this.output.appendLine(`API: ${snapshot.apiBaseUrl}`);
    this.output.appendLine(`Кабинет: ${snapshot.dashboardUrl}`);
    this.output.appendLine(`Авторизация: ${snapshot.hasToken ? 'есть' : 'нет'}`);
    this.output.appendLine(`Ключ подписи: ${snapshot.hasEventSecret ? 'есть' : 'нет'}`);
    this.output.appendLine(`Реклама: ${snapshot.adsEnabled ? 'включена' : 'выключена'}`);
    this.output.appendLine(`Интеграции: ${snapshot.integrationEnabled ? 'включены' : 'выключены'}`);
    this.output.appendLine(`Codex найден: ${snapshot.codexExtensionDetected ? `да (${snapshot.codexExtensionVersion ?? 'версия неизвестна'})` : 'нет'}`);
    this.output.appendLine(`UI-патч Codex: ${patchLabel(codexPatch.value)}`);
    this.output.appendLine(`Hooks Codex: ${snapshot.codexHooksInstalled ? 'установлены' : 'не установлены'}`);
    this.output.appendLine(`Claude Code найден: ${snapshot.claudeExtensionDetected ? `да (${snapshot.claudeExtensionVersion ?? 'версия неизвестна'})` : 'нет'}`);
    this.output.appendLine(`UI-патч Claude Code: ${patchLabel(claudePatch.value)}`);
    this.output.appendLine(`Hooks Claude Code: ${snapshot.claudeHooksInstalled ? 'установлены' : 'не установлены'}`);
    this.output.appendLine(`Локальный bridge: ${snapshot.codexBridgeListening ? 'слушает' : 'остановлен'}`);
    this.output.appendLine(`Активных ожиданий Codex: ${snapshot.codexActiveTurns}`);
    this.output.appendLine(`Активных ожиданий Claude Code: ${snapshot.claudeActiveTurns}`);
    this.output.appendLine(`Показ рекламы: ${snapshot.adPresenterRunning ? 'активен' : 'остановлен'}`);
    this.output.appendLine(`Объявление видно: ${snapshot.adVisible ? 'да' : 'нет'}`);
    this.output.appendLine(`Окно VS Code активно: ${snapshot.activeWindow ? 'да' : 'нет'}`);
    this.output.appendLine(`Событий в очереди: ${snapshot.pendingTelemetry}`);
    this.output.appendLine(`Последняя отправка: ${snapshot.lastEventAt ?? 'нет'}`);
    this.output.appendLine(`Последняя ошибка: ${snapshot.lastError ?? 'нет'}`);
    this.output.appendLine(`Ошибка bridge: ${snapshot.bridgeError ?? 'нет'}`);
    this.output.appendLine(`Ошибка hooks Codex: ${codexHooks.error ?? 'нет'}`);
    this.output.appendLine(`Ошибка hooks Claude Code: ${claudeHooks.error ?? 'нет'}`);
    this.output.appendLine(`Ошибка UI-патча Codex: ${codexPatch.error ?? 'нет'}`);
    this.output.appendLine(`Ошибка UI-патча Claude Code: ${claudePatch.error ?? 'нет'}`);

    try {
      await this.api.ping();
      this.output.appendLine('Проверка API: успешно');
    } catch (error) {
      this.output.appendLine(`Проверка API: ошибка (${error instanceof Error ? error.message : String(error)})`);
    }

    this.output.appendLine('');
    this.output.appendLine('Адаптеры');
    for (const adapter of createToolAdapters()) {
      const result = await adapter.diagnostics();
      this.output.appendLine(`${result.name}: ${result.detection.message}`);
      for (const check of result.checks) {
        this.output.appendLine(`  - ${check}`);
      }
    }

    this.output.show(true);
  }

  dispose(): void {
    this.output.dispose();
  }
}

async function inspectSafely<T>(read: () => Promise<T | undefined>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await read() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function patchLabel(status: {
  installed: boolean;
  compatible: boolean;
  compatibilityMode: 'exact' | 'structural' | 'unsupported';
} | undefined): string {
  if (!status) {
    return 'расширение не найдено';
  }
  if (!status.compatible) {
    return 'структура изменилась, реклама отключена';
  }
  const compatibility = status.compatibilityMode === 'structural'
    ? 'структурно совместим'
    : 'точно проверен';
  return status.installed ? `установлен (${compatibility})` : `не установлен (${compatibility})`;
}

function diagnosticValue(read: () => string): string {
  try {
    return read();
  } catch (error) {
    return `ошибка настройки: ${error instanceof Error ? error.message : String(error)}`;
  }
}

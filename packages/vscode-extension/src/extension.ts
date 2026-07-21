import * as vscode from 'vscode';
import { adPresentationText } from './adCopy';
import {
  KodpauzaApiClient,
  type ExtensionPatchErrorCategory,
  type ExtensionPatchStatus,
} from './apiClient';
import { CodexHookBridge, IntegrationTool } from './codexBridge';
import { CodexHookInstaller, defaultKodpauzaHome } from './codexHookInstaller';
import { ClaudeHookInstaller } from './claudeHookInstaller';
import {
  ClaudeLifecycleController,
  CodexDetection,
  CodexLifecycleController,
  detectClaudeExtension,
  detectCodexExtension,
} from './codexLifecycle';
import { ClaudePatchInstaller } from './claudePatchInstaller';
import { CODEX_UI_BRIDGE_PORT, CodexPatchInstaller } from './codexPatchInstaller';
import { StatusBarAdPresenter } from './adPresenter';
import { DiagnosticsReporter } from './diagnostics';
import { KodpauzaState } from './state';
import { TelemetryOutbox } from './telemetryOutbox';
import { normalizeExternalUrl } from './urls';
import { shouldAutomaticallyConnectIntegrations } from './integrationAutoConnect';
import { findBundledCodexCli } from './codexCli';
import {
  isLocalRuntimePolicyUrl,
  RuntimePolicyManager,
  type RuntimePolicySurface,
} from './runtimePolicy';
import { runtimeReloadDecision } from './runtimeWatchdog';
import { ExtensionUpdater } from './extensionUpdater';

type CommandHandler = (...args: unknown[]) => void | Promise<void>;
type IntegrationDetection = CodexDetection;
type LifecycleController = CodexLifecycleController | ClaudeLifecycleController;
type HookInstaller = CodexHookInstaller | ClaudeHookInstaller;
type PatchInstaller = CodexPatchInstaller | ClaudePatchInstaller;

type IntegrationRuntime = {
  tool: IntegrationTool;
  name: string;
  detection: IntegrationDetection;
  presenter: StatusBarAdPresenter;
  lifecycle: LifecycleController;
  hooks: HookInstaller;
  patch?: PatchInstaller;
  patchToken?: string;
  compatible?: boolean;
  compatibilityMode?: 'exact' | 'structural' | 'unsupported';
  patchErrorCategory?: ExtensionPatchErrorCategory;
};

type IntegrationConnectionMode = 'manual' | 'login' | 'startup';

type IntegrationConnectionResult = {
  connected: string[];
  failures: string[];
  changed: boolean;
};

const KODPAUZA_FALLBACK_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#10b981"/><path d="M4.25 4.5 2 8l2.25 3.5M11.75 4.5 14 8l-2.25 3.5M9.5 3.5l-3 9" fill="none" stroke="white" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;
const RUNTIME_WATCHDOG_INTERVAL_MS = 30_000;
const RUNTIME_WATCHDOG_MISSING_UI_THRESHOLD = 2;
const RUNTIME_POLICY_REFRESH_INTERVAL_MS = 60_000;
const RUNTIME_POLICY_CACHE_KEY = 'kodpauza.runtimePolicy.lastKnownGood.v1';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const state = new KodpauzaState(context);
  await state.initialize();

  const api = new KodpauzaApiClient(
    () => state.accessToken(),
    () => state.eventSecret(),
    {
      refreshTokenProvider: () => state.refreshToken(),
      onSession: (session) =>
        state.setAuthSession(session.token, session.refreshToken, session.eventSecret),
      onSessionInvalid: () => state.clearAuthSession(),
    },
  );
  const runtimePolicy = new RuntimePolicyManager(
    () => api.runtimePolicy(),
    {
      get: () => context.globalState.get<unknown>(RUNTIME_POLICY_CACHE_KEY),
      set: async (value) => {
        await context.globalState.update(RUNTIME_POLICY_CACHE_KEY, value);
      },
    },
    { allowUnsignedLocalDevelopment: isLocalRuntimePolicyUrl(api.apiBaseUrl) },
  );
  if (!(await runtimePolicy.loadCached())) {
    await runtimePolicy.refresh();
  } else {
    void runtimePolicy.refresh();
  }
  if ((await state.accessToken()) && !(await state.refreshToken())) {
    try {
      await api.ensurePersistentSession();
    } catch {
      if (!(await state.accessToken())) {
        void vscode.window.showWarningMessage(
          'Старая сессия Kodpauza истекла. Войдите один раз, последующие обновления сохранят авторизацию.',
        );
      }
    }
  }

  const outbox = new TelemetryOutbox(api, state);
  const clientVersion = String(context.extension.packageJSON.version ?? '0.0.0');
  const extensionUpdater = new ExtensionUpdater(context, api, clientVersion);
  const codexPresenter = new StatusBarAdPresenter(
    api,
    state,
    outbox,
    clientVersion,
    'kodpauza.ad.codex',
  );
  const claudePresenter = new StatusBarAdPresenter(
    api,
    state,
    outbox,
    clientVersion,
    'kodpauza.ad.claude',
  );
  const codexLifecycle = new CodexLifecycleController(state, codexPresenter);
  const claudeLifecycle = new ClaudeLifecycleController(state, claudePresenter);
  const codexDetection = detectCodexExtension();
  const claudeDetection = detectClaudeExtension();
  const sourceHookPath = context.asAbsolutePath('resources/codex-hook.cjs');
  const codexHooks = new CodexHookInstaller(sourceHookPath);
  const claudeHooks = new ClaudeHookInstaller(sourceHookPath);

  const integrations: Record<IntegrationTool, IntegrationRuntime> = {
    codex: {
      tool: 'codex',
      name: 'Codex',
      detection: codexDetection,
      presenter: codexPresenter,
      lifecycle: codexLifecycle,
      hooks: codexHooks,
      patch: createCodexPatchInstaller(codexDetection),
    },
    claude: {
      tool: 'claude',
      name: 'Claude Code',
      detection: claudeDetection,
      presenter: claudePresenter,
      lifecycle: claudeLifecycle,
      hooks: claudeHooks,
      patch: createClaudePatchInstaller(claudeDetection),
    },
  };

  const runtimeSurface = (tool: IntegrationTool): RuntimePolicySurface =>
    tool === 'claude' ? 'claude_code_vscode' : 'codex_vscode';
  const canPatchRuntime = (runtime: IntegrationRuntime): boolean =>
    runtimePolicy.canPatch({ tool: runtime.tool, version: runtime.detection.version });
  const canServeRuntime = (runtime: IntegrationRuntime, campaignId?: string): boolean =>
    runtimePolicy.canServe({
      tool: runtime.tool,
      version: runtime.detection.version,
      surface: runtimeSurface(runtime.tool),
      campaignId,
    });
  const applyPolicyToPresenters = (): void => {
    for (const runtime of Object.values(integrations)) {
      runtime.presenter.setRuntimePolicyGuard(({ surface, toolVersion, campaignId }) =>
        runtimePolicy.canServe({
          tool: runtime.tool,
          version: toolVersion,
          surface,
          campaignId,
        }),
      );
    }
  };
  applyPolicyToPresenters();

  const refreshIntegrationDetections = (): void => {
    const detections: Record<IntegrationTool, IntegrationDetection> = {
      codex: detectCodexExtension(),
      claude: detectClaudeExtension(),
    };
    for (const runtime of Object.values(integrations)) {
      const detection = detections[runtime.tool];
      if (
        runtime.detection.extensionId === detection.extensionId &&
        runtime.detection.extensionPath === detection.extensionPath &&
        runtime.detection.version === detection.version
      ) {
        continue;
      }
      runtime.detection = detection;
      runtime.patch = runtime.tool === 'codex'
        ? createCodexPatchInstaller(detection)
        : createClaudePatchInstaller(detection);
      runtime.patchToken = undefined;
      runtime.compatible = undefined;
      runtime.compatibilityMode = undefined;
      runtime.patchErrorCategory = undefined;
      runtime.presenter.setPatchedUiEnabled(false);
    }
  };

  let autoReloadRequired = false;
  for (const runtime of Object.values(integrations)) {
    if (!runtime.patch) {
      runtime.presenter.setPatchedUiEnabled(false);
      continue;
    }
    try {
      const ensured = state.integrationEnabled && canPatchRuntime(runtime)
        ? await runtime.patch.ensureInstalled()
        : undefined;
      const status = ensured ?? (await runtime.patch.inspect());
      runtime.compatible = status.compatible;
      runtime.compatibilityMode = status.compatibilityMode;
      runtime.patchToken = status.token;
      runtime.patchErrorCategory = undefined;
      runtime.presenter.setPatchedUiEnabled(status.installed);
      autoReloadRequired ||= ensured?.changed ?? false;
    } catch (error) {
      runtime.patchErrorCategory = patchErrorCategory(error);
      runtime.presenter.setPatchedUiEnabled(false);
      void vscode.window.showWarningMessage(
        `Kodpauza обнаружила неполный UI-патч ${runtime.name}: ${userErrorMessage(error)} Запустите команду «Kodpauza: Восстановить интеграции».`,
      );
    }
  }

  const bridge = new CodexHookBridge(
    defaultKodpauzaHome(),
    workspaceRoots,
    async (event, tool) => {
      const runtime = integrations[tool];
      if (canServeRuntime(runtime)) {
        await runtime.lifecycle.handle(event);
      } else {
        runtime.lifecycle.stopAll();
      }
    },
    {
      uiPort: CODEX_UI_BRIDGE_PORT,
      uiEnabled: () => vscode.window.state.focused,
      onUiActivity: async (tool, active) => {
        const runtime = integrations[tool];
        if (canServeRuntime(runtime)) {
          await runtime.lifecycle.handleUiActivity(active);
        } else {
          runtime.lifecycle.stopAll();
        }
      },
      uiAdapters: {
        codex: createUiAdapter(integrations.codex),
        claude: createUiAdapter(integrations.claude),
      },
    },
  );
  const diagnostics = new DiagnosticsReporter(
    api,
    state,
    { codex: codexPresenter, claude: claudePresenter },
    bridge,
    { codex: codexLifecycle, claude: claudeLifecycle },
    { codex: codexHooks, claude: claudeHooks },
    () => {
      refreshIntegrationDetections();
      return {
        codex: integrations.codex.patch as CodexPatchInstaller | undefined,
        claude: integrations.claude.patch as ClaudePatchInstaller | undefined,
      };
    },
  );

  const reportDetectedVersions = async (): Promise<void> => {
    refreshIntegrationDetections();
    await Promise.all(
      Object.values(integrations).map(async (runtime) => {
        const version = runtime.detection.version;
        if (!version || runtime.compatible === undefined) {
          return;
        }
        if (await state.accessToken()) {
          try {
            await api.reportIntegrationVersion(runtime.tool, {
              version,
              supported: runtime.compatible,
              compatibilityMode:
                runtime.compatibilityMode ?? (runtime.compatible ? 'exact' : 'unsupported'),
              clientVersion,
              editorName: vscode.env.appName.slice(0, 80),
            });
          } catch {
            // Reporting is best-effort and never blocks the editor.
          }
        }

        if (
          runtime.compatible ||
          state.lastUnsupportedIntegrationVersion(runtime.tool) === version
        ) {
          return;
        }
        await state.markUnsupportedIntegrationVersion(runtime.tool, version);
        const action = await vscode.window.showWarningMessage(
          `${runtime.name} обновился. Kodpauza не смогла доказать совместимость новой структуры, поэтому реклама временно отключена. Версия отправлена в центр обновлений.`,
          'Открыть диагностику',
        );
        if (action === 'Открыть диагностику') {
          await vscode.commands.executeCommand('kodpauza.runDiagnostics');
        }
      }),
    );
  };

  const reportInstallHeartbeat = async (): Promise<void> => {
    if (!(await state.accessToken())) return;
    try {
      refreshIntegrationDetections();
      await api.reportInstallHeartbeat({
        installId: state.installId,
        vscodeVersion: vscode.version.slice(0, 40),
        extensionVersion: clientVersion.slice(0, 40),
        os: process.platform.slice(0, 40),
        integrationsEnabled: state.integrationEnabled,
        codexDetected: integrations.codex.detection.detected,
        claudeDetected: integrations.claude.detection.detected,
        heartbeatSchemaVersion: 2,
        editorName: vscode.env.appName.slice(0, 80),
        codexVersion: integrations.codex.detection.version?.slice(0, 40),
        claudeVersion: integrations.claude.detection.version?.slice(0, 40),
        codexPatchStatus: extensionPatchStatus(integrations.codex),
        claudePatchStatus: extensionPatchStatus(integrations.claude),
        codexPatchErrorCategory: integrations.codex.patchErrorCategory,
        claudePatchErrorCategory: integrations.claude.patchErrorCategory,
      });
    } catch {
      // Heartbeats are best-effort and never interrupt the editor.
    }
  };

  let reconciliation: Promise<void> = Promise.resolve();
  const reconcileIntegration = (): Promise<void> => {
    reconciliation = reconciliation
      .catch(() => undefined)
      .then(async () => {
        refreshIntegrationDetections();
        if (!state.adsEnabled || !state.integrationEnabled || !runtimePolicy.policy?.enabled) {
          for (const runtime of Object.values(integrations)) {
            runtime.lifecycle.stopAll();
          }
          await bridge.stop();
          return;
        }

        const failures: string[] = [];
        await Promise.all(
          Object.values(integrations)
            .filter((runtime) => runtime.detection.detected && canServeRuntime(runtime))
            .map(async (runtime) => {
              try {
                const hooks = await runtime.hooks.inspect();
                if (!hooks.installed) {
                  await runtime.hooks.install();
                }
              } catch (error) {
                failures.push(`${runtime.name}: ${userErrorMessage(error)}`);
              }
            }),
        );
        if (
          vscode.window.state.focused &&
          Object.values(integrations).some(
            (runtime) => runtime.detection.detected && canServeRuntime(runtime),
          )
        ) {
          await bridge.start();
        } else {
          await bridge.stop();
        }
        if (failures.length > 0) {
          void vscode.window.showWarningMessage(
            `Не удалось установить часть hooks Kodpauza. ${failures.join(' ')}`,
          );
        }
      });
    return reconciliation;
  };

  let runtimeWatchdog: Promise<void> | undefined;
  let runtimeReloadScheduled = false;
  let runtimePatchReloadPending = false;
  let runtimeUiReloadPending = false;
  const missingUiHeartbeats: Record<IntegrationTool, number> = { codex: 0, claude: 0 };
  const ensureRuntimeHealthy = (): Promise<void> => {
    if (runtimeWatchdog) {
      return runtimeWatchdog;
    }
    const operation = (async () => {
      if (
        !state.adsEnabled ||
        !state.integrationEnabled ||
        !vscode.window.state.focused
      ) {
        return;
      }

      refreshIntegrationDetections();
      let activeTurnMissingUi = false;
      let anyTurnActive = false;
      for (const runtime of Object.values(integrations)) {
        const active =
          runtime.detection.detected && canServeRuntime(runtime) && runtime.presenter.isRunning;
        anyTurnActive ||= active;
        if (!active || runtime.presenter.isVisible) {
          missingUiHeartbeats[runtime.tool] = 0;
          continue;
        }
        missingUiHeartbeats[runtime.tool] += 1;
        if (
          missingUiHeartbeats[runtime.tool] >= RUNTIME_WATCHDOG_MISSING_UI_THRESHOLD
        ) {
          activeTurnMissingUi = true;
        }
      }
      if (anyTurnActive) {
        // A recovered heartbeat cancels a cache-only reload. A changed bundle
        // remains pending independently and is still reloaded after the turn.
        runtimeUiReloadPending = activeTurnMissingUi;
      }
      let changed = false;
      await Promise.all(
        Object.values(integrations)
          .filter(
            (runtime) => runtime.detection.detected && runtime.patch && canPatchRuntime(runtime),
          )
          .map(async (runtime) => {
            try {
              const status = await runtime.patch!.ensureInstalled();
              runtime.compatible = status.compatible;
              runtime.compatibilityMode = status.compatibilityMode;
              runtime.patchToken = status.token;
              runtime.patchErrorCategory = undefined;
              runtime.presenter.setPatchedUiEnabled(status.installed);
              changed ||= status.changed;
            } catch (error) {
              runtime.patchErrorCategory = patchErrorCategory(error);
              runtime.presenter.setPatchedUiEnabled(false);
              return;
            }
            try {
              const hooks = await runtime.hooks.inspect();
              if (!hooks.installed) {
                await runtime.hooks.install();
              }
            } catch {
              // UI activity remains usable; the next watchdog pass retries hooks independently.
            }
          }),
      );
      await reconcileIntegration();
      runtimePatchReloadPending ||= changed;
      const decision = runtimeReloadDecision({
        patchChanged: runtimePatchReloadPending,
        activeTurnMissingUi,
        anyTurnActive,
        reloadPending: runtimeUiReloadPending,
      });
      if (decision.reloadNow && !runtimeReloadScheduled) {
        runtimePatchReloadPending = false;
        runtimeUiReloadPending = false;
        runtimeReloadScheduled = true;
        scheduleReload('Kodpauza автоматически восстановила интеграцию. Перезапускаю окно...');
      }
    })();
    const tracked: Promise<void> = operation
      .catch(() => undefined)
      .finally(() => {
        if (runtimeWatchdog === tracked) {
          runtimeWatchdog = undefined;
        }
      });
    runtimeWatchdog = tracked;
    return runtimeWatchdog;
  };

  const register = (command: string, handler: CommandHandler): vscode.Disposable =>
    vscode.commands.registerCommand(command, async (...args: unknown[]) => {
      try {
        await handler(...args);
      } catch (error) {
        await vscode.window.showErrorMessage(userErrorMessage(error));
      }
    });

  const openCodexHooksCli = async (): Promise<void> => {
    const detection = detectCodexExtension();
    const bundledCli = detection.extensionPath
      ? await findBundledCodexCli(detection.extensionPath)
      : undefined;
    if (!bundledCli) {
      throw new Error(
        'Встроенный Codex CLI не найден. Обновите расширение Codex и повторите проверку hooks.',
      );
    }
    const terminal = vscode.window.createTerminal({
      name: 'Kodpauza: Codex hooks',
      shellPath: bundledCli,
    });
    terminal.show();
    await vscode.window.showInformationMessage(
      'Codex CLI запущен из установленного расширения. Выполните /hooks и разрешите hooks Kodpauza.',
    );
  };

  const connectIntegrations = async (
    mode: IntegrationConnectionMode,
  ): Promise<IntegrationConnectionResult> => {
    refreshIntegrationDetections();
    const detected = Object.values(integrations).filter((runtime) => runtime.detection.detected);
    if (detected.length === 0) {
      const message = 'Kodpauza не нашла установленные расширения Codex или Claude Code.';
      if (mode === 'manual') {
        throw new Error(message);
      }
      return { connected: [], failures: [message], changed: false };
    }

    if (mode === 'manual') {
      const confirmation = await vscode.window.showWarningMessage(
        'Подключить Kodpauza ко всем найденным AI-инструментам?',
        {
          modal: true,
          detail:
            'Kodpauza установит lifecycle hooks и изменит только файлы проверенных версий Codex и Claude Code. Перед каждым изменением создается полная резервная копия.',
        },
        'Подключить',
      );
      if (confirmation !== 'Подключить') {
        return { connected: [], failures: [], changed: false };
      }
    }

    if (!state.integrationEnabled) {
      await state.savePatchBackup();
    }
    const connected: string[] = [];
    const failures: string[] = [];
    let changed = false;
    for (const runtime of detected) {
      if (!runtime.patch) {
        failures.push(`${runtime.name}: структура расширения не распознана.`);
        continue;
      }
      if (!canPatchRuntime(runtime)) {
        failures.push(`${runtime.name}: подключение временно остановлено политикой безопасности.`);
        continue;
      }
      try {
        const result = await runtime.patch.ensureInstalled();
        runtime.compatible = result.compatible;
        runtime.compatibilityMode = result.compatibilityMode;
        runtime.patchErrorCategory = undefined;
        if (!result.compatible) {
          failures.push(
            `${runtime.name} ${runtime.detection.version ?? ''}: версия пока не поддерживается.`,
          );
          continue;
        }
        runtime.patchToken = result.token;
        runtime.presenter.setPatchedUiEnabled(result.installed);
        await runtime.hooks.install();
        connected.push(runtime.name);
        changed ||= result.changed;
      } catch (error) {
        runtime.patchErrorCategory = patchErrorCategory(error);
        failures.push(`${runtime.name}: ${userErrorMessage(error)}`);
      }
    }
    if (connected.length === 0) {
      if (mode === 'manual') {
        throw new Error(failures.join(' ') || 'Не удалось подключить найденные интеграции.');
      }
      return { connected, failures, changed };
    }

    await state.setAutoConnectIntegrations(true);
    await state.setIntegrationEnabled(true);
    await state.setAdsEnabled(true);
    await reconcileIntegration();
    if (mode === 'manual' && failures.length > 0) {
      void vscode.window.showWarningMessage(
        `Подключено: ${connected.join(', ')}. ${failures.join(' ')}`,
      );
    }
    if (mode === 'manual' && changed) {
      scheduleReload('Kodpauza подключила интеграции. Перезапускаю окно...');
    } else if (mode === 'manual') {
      await vscode.window.showInformationMessage(
        `Интеграции Kodpauza работают: ${connected.join(', ')}.`,
      );
    }
    return { connected, failures, changed };
  };

  const installIntegrations = async (): Promise<void> => {
    await connectIntegrations('manual');
  };

  const removeIntegrations = async (): Promise<void> => {
    refreshIntegrationDetections();
    const confirmation = await vscode.window.showWarningMessage(
      'Отключить все интеграции Kodpauza?',
      {
        modal: true,
        detail:
          'Hooks Kodpauza будут удалены, а измененные файлы Codex и Claude Code восстановлены из резервных копий.',
      },
      'Отключить',
    );
    if (confirmation !== 'Отключить') {
      return;
    }

    for (const runtime of Object.values(integrations)) {
      runtime.lifecycle.stopAll();
    }
    await bridge.stop();
    const failures = await removeRuntimeIntegrations(integrations);
    await state.setAutoConnectIntegrations(false);
    await state.setIntegrationEnabled(false);
    if (failures.length > 0) {
      throw new Error(
        `Интеграции отключены, но часть файлов требует ручной проверки. ${failures.join(' ')}`,
      );
    }
    await vscode.window.showInformationMessage('Интеграции Kodpauza отключены.');
  };

  let extensionReloadTimer: NodeJS.Timeout | undefined;
  const startupVersions = {
    codex: codexDetection.version,
    claude: claudeDetection.version,
  };

  context.subscriptions.push(
    codexPresenter,
    claudePresenter,
    codexLifecycle,
    claudeLifecycle,
    bridge,
    outbox,
    diagnostics,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('kodpauza.adsEnabled') ||
        event.affectsConfiguration('kodpauza.integrationsEnabled')
      ) {
        void reconcileIntegration().catch((error) =>
          vscode.window.showErrorMessage(userErrorMessage(error)),
        );
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void bridge
        .refresh()
        .catch((error) => vscode.window.showErrorMessage(userErrorMessage(error)));
    }),
    vscode.window.onDidChangeWindowState((windowState) => {
      if (windowState.focused) {
        void reconcileIntegration().catch((error) =>
          vscode.window.showErrorMessage(userErrorMessage(error)),
        );
        return;
      }
      for (const runtime of Object.values(integrations)) {
        runtime.lifecycle.stopAll();
      }
      void bridge.stop().catch((error) => vscode.window.showErrorMessage(userErrorMessage(error)));
    }),
    vscode.extensions.onDidChange(() => {
      if (extensionReloadTimer) {
        return;
      }
      extensionReloadTimer = setTimeout(() => {
        extensionReloadTimer = undefined;
        const current = {
          codex: detectCodexExtension().version,
          claude: detectClaudeExtension().version,
        };
        if (current.codex !== startupVersions.codex || current.claude !== startupVersions.claude) {
          for (const runtime of Object.values(integrations)) {
            runtime.presenter.setPatchedUiEnabled(false);
            runtime.lifecycle.stopAll();
          }
          scheduleReload('Kodpauza обнаружила обновление AI-инструмента. Обновляю интеграции...');
        }
      }, 1_500);
      extensionReloadTimer.unref();
    }),
    register('kodpauza.login', async () => {
      const email = await vscode.window.showInputBox({
        title: 'Kodpauza: вход',
        prompt: 'Рабочая почта',
        placeHolder: 'developer@example.ru',
        ignoreFocusOut: true,
        validateInput: (value) => (value.includes('@') ? undefined : 'Введите корректную почту.'),
      });
      if (!email) {
        return;
      }
      const password = await vscode.window.showInputBox({
        title: 'Kodpauza: вход',
        prompt: 'Пароль',
        password: true,
        ignoreFocusOut: true,
      });
      if (!password) {
        return;
      }

      const login = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Вход в Kodpauza',
        },
        () => api.login(email, password),
      );
      await state.setAuthSession(login.token, login.refreshToken, login.eventSecret);
      const connection = shouldAutomaticallyConnectIntegrations({
        trigger: 'login',
        authenticated: true,
        autoConnectEnabled: state.autoConnectIntegrations,
        integrationEnabled: state.integrationEnabled,
      })
        ? await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Kodpauza подключает AI-инструменты',
            },
            () => connectIntegrations('login'),
          )
        : undefined;
      await outbox.flush();
      await reportDetectedVersions();
      await reportInstallHeartbeat();
      if (connection?.changed) {
        scheduleReload('Вход выполнен. Kodpauza подключила интеграции и перезапускает окно...');
      } else if (connection?.connected.length) {
        await vscode.window.showInformationMessage(
          `Вход выполнен. Интеграции работают: ${connection.connected.join(', ')}.`,
        );
      } else if (connection?.failures.length) {
        await vscode.window.showWarningMessage(
          `Вход выполнен, но автоматическое подключение не завершено. ${connection.failures.join(' ')}`,
        );
      } else {
        await vscode.window.showInformationMessage('Вход в Kodpauza выполнен.');
      }
    }),
    register('kodpauza.logout', async () => {
      for (const runtime of Object.values(integrations)) {
        runtime.lifecycle.stopAll();
      }
      await state.setAdsEnabled(false);
      await reconcileIntegration();
      await api.logout().catch(() => undefined);
      await state.clearAuthSession();
      await state.clearTelemetry();
      await vscode.window.showInformationMessage(
        'Вы вышли из Kodpauza. Локальная очередь событий очищена.',
      );
    }),
    register('kodpauza.enableAds', async () => {
      await state.setAdsEnabled(true);
      await reconcileIntegration();
      await vscode.window.showInformationMessage('Реклама Kodpauza включена.');
    }),
    register('kodpauza.disableAds', async () => {
      for (const runtime of Object.values(integrations)) {
        runtime.lifecycle.stopAll();
      }
      await state.setAdsEnabled(false);
      await reconcileIntegration();
      await vscode.window.showInformationMessage('Реклама Kodpauza выключена.');
    }),
    register('kodpauza.codex.installIntegration', installIntegrations),
    register('kodpauza.codex.removeIntegration', removeIntegrations),
    register('kodpauza.codex.openHooks', openCodexHooksCli),
    register('kodpauza.installPatch', installIntegrations),
    register('kodpauza.removePatch', removeIntegrations),
    register('kodpauza.restoreBackup', async () => {
      for (const runtime of Object.values(integrations)) {
        runtime.lifecycle.stopAll();
      }
      await bridge.stop();
      const failures = await removeRuntimeIntegrations(integrations);
      await state.restorePatchBackup();
      await reconcileIntegration();
      if (failures.length > 0) {
        throw new Error(
          `Настройки восстановлены, но часть файлов требует проверки. ${failures.join(' ')}`,
        );
      }
      await vscode.window.showInformationMessage(
        'Интеграции и настройки Kodpauza восстановлены из резервных копий.',
      );
    }),
    register('kodpauza.runDiagnostics', async () => diagnostics.run()),
    register('kodpauza.showBalance', async () => {
      const balance = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Загрузка баланса Kodpauza',
        },
        () => api.balance(),
      );
      await vscode.window.showInformationMessage(
        `Баланс Kodpauza: ${(balance.balanceKopecks / 100).toFixed(2)} ₽`,
      );
    }),
    register('kodpauza.openDashboard', async () => openExternal(api.dashboardUrl)),
    register('kodpauza.checkForUpdates', async () => extensionUpdater.check(true)),
    register('kodpauza.openAd', async () => {
      const presenter = [claudePresenter, codexPresenter].find(
        (candidate) => candidate.isVisible && candidate.ad,
      );
      const ad = presenter?.ad;
      if (!presenter || !ad) {
        await vscode.window.showInformationMessage('Сейчас нет активного объявления Kodpauza.');
        return;
      }
      if (await presenter.recordClick()) {
        await openExternal(ad.url);
      }
    }),
  );

  const authenticatedAtStartup = Boolean(await state.accessToken());
  if (shouldAutomaticallyConnectIntegrations({
    trigger: 'startup',
    authenticated: authenticatedAtStartup,
    autoConnectEnabled: state.autoConnectIntegrations,
    integrationEnabled: state.integrationEnabled,
  })) {
    const startupConnection = await connectIntegrations('startup');
    autoReloadRequired ||= startupConnection.changed;
  }

  outbox.start();
  extensionUpdater.start();
  await reconcileIntegration();
  await reportDetectedVersions();
  await reportInstallHeartbeat();
  const heartbeatTimer = setInterval(() => void reportInstallHeartbeat(), 15 * 60 * 1000);
  heartbeatTimer.unref();
  context.subscriptions.push({ dispose: () => clearInterval(heartbeatTimer) });
  const runtimeWatchdogTimer = setInterval(
    () => void ensureRuntimeHealthy(),
    RUNTIME_WATCHDOG_INTERVAL_MS,
  );
  runtimeWatchdogTimer.unref();
  context.subscriptions.push({ dispose: () => clearInterval(runtimeWatchdogTimer) });
  const runtimePolicyTimer = setInterval(() => {
    void runtimePolicy
      .refresh()
      .then(async () => {
        applyPolicyToPresenters();
        for (const runtime of Object.values(integrations)) {
          if (!canServeRuntime(runtime)) runtime.lifecycle.stopAll();
        }
        await reconcileIntegration();
      })
      .catch((error) => {
        console.error('Kodpauza runtime policy reconciliation failed:', userErrorMessage(error));
      });
  }, RUNTIME_POLICY_REFRESH_INTERVAL_MS);
  runtimePolicyTimer.unref();
  context.subscriptions.push({ dispose: () => clearInterval(runtimePolicyTimer) });
  if (autoReloadRequired) {
    scheduleReload('Kodpauza восстановила интеграции после обновления. Перезапускаю окно...');
  }
}

export function deactivate(): void {
  // VS Code disposes resources registered in ExtensionContext.
}

function createCodexPatchInstaller(
  detection: IntegrationDetection,
): CodexPatchInstaller | undefined {
  return detection.extensionPath && detection.version
    ? new CodexPatchInstaller(detection.extensionPath, detection.version)
    : undefined;
}

function createClaudePatchInstaller(
  detection: IntegrationDetection,
): ClaudePatchInstaller | undefined {
  return detection.extensionPath && detection.version
    ? new ClaudePatchInstaller(detection.extensionPath, detection.version)
    : undefined;
}

function createUiAdapter(runtime: IntegrationRuntime): {
  token: () => string | undefined;
  currentAd: () =>
    | {
        active: true;
        adId: string;
        text: string;
        format: 'standard' | 'premium';
        advertiserName: string;
        erid: string;
        iconUrl?: string;
        domain?: string;
        destinationHost?: string;
        tooltipDomain?: string;
        canary?: boolean;
      }
    | undefined;
  onAdClick: (adId: string) => Promise<void>;
  onVisibility: (event: { adId: string; viewId: string; visible: boolean }) => void;
} {
  return {
    token: () => runtime.patchToken,
    currentAd: () => {
      const ad = runtime.presenter.ad;
      if (!runtime.presenter.canRenderPatchedUi || !ad) {
        return undefined;
      }
      const domain = safeAdDomain(ad.url);
      const canary = ad.campaignId === 'house' || ad.trackable === false;
      return {
        active: true,
        adId: ad.adId,
        text: adPresentationText(ad.campaignName, ad.text),
        format: ad.format,
        advertiserName: ad.campaignName,
        erid: ad.erid ?? '',
        iconUrl: canary ? KODPAUZA_FALLBACK_ICON : undefined,
        domain,
        // Kept temporarily for patched UIs released before the `domain` field was agreed.
        destinationHost: domain,
        tooltipDomain: domain,
        canary,
      };
    },
    onAdClick: async (adId) => {
      const ad = runtime.presenter.ad;
      if (!ad || ad.adId !== adId || !(await runtime.presenter.recordClick())) {
        return;
      }
      await openExternal(ad.url);
    },
    onVisibility: ({ adId, viewId, visible }) =>
      runtime.presenter.markPatchedUiVisibility(adId, viewId, visible),
  };
}

function safeAdDomain(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.hostname : undefined;
  } catch {
    return undefined;
  }
}

function extensionPatchStatus(runtime: IntegrationRuntime): ExtensionPatchStatus | undefined {
  if (!runtime.detection.detected) return undefined;
  if (runtime.patchErrorCategory) return 'error';
  if (runtime.compatible === false || runtime.compatibilityMode === 'unsupported') {
    return 'unsupported';
  }
  if (!runtime.patchToken) {
    return runtime.compatible === true ? 'not_installed' : 'unknown';
  }
  return runtime.compatibilityMode === 'structural'
    ? 'installed_structural'
    : 'installed_exact';
}

function patchErrorCategory(error: unknown): ExtensionPatchErrorCategory {
  const message = userErrorMessage(error).toLowerCase();
  if (/unsupported|не поддерж|совместим|version|верси/.test(message)) return 'compatibility';
  if (/permission|eacces|eperm|доступ|прав/.test(message)) return 'permission';
  if (/hash|checksum|verify|провер|сигнатур|структур/.test(message)) return 'verification';
  if (/enoent|filesystem|файл|каталог|directory|path/.test(message)) return 'filesystem';
  if (/runtime|bridge|socket|port|процесс/.test(message)) return 'runtime';
  return 'unknown';
}

async function removeRuntimeIntegrations(
  integrations: Record<IntegrationTool, IntegrationRuntime>,
): Promise<string[]> {
  const failures: string[] = [];
  for (const runtime of Object.values(integrations)) {
    try {
      await runtime.hooks.remove();
    } catch (error) {
      failures.push(`${runtime.name} hooks: ${userErrorMessage(error)}`);
    }
    if (runtime.patch) {
      try {
        await runtime.patch.restore();
      } catch (error) {
        failures.push(`${runtime.name} UI: ${userErrorMessage(error)}`);
      }
    }
    runtime.patchToken = undefined;
    runtime.presenter.setPatchedUiEnabled(false);
  }
  return failures;
}

function scheduleReload(message: string): void {
  void vscode.window.setStatusBarMessage(message, 2_500);
  setTimeout(() => {
    void vscode.commands.executeCommand('workbench.action.reloadWindow');
  }, 700);
}

async function openExternal(value: string): Promise<void> {
  const safeUrl = normalizeExternalUrl(value);
  const opened = await vscode.env.openExternal(vscode.Uri.parse(safeUrl, true));
  if (!opened) {
    throw new Error('Не удалось открыть ссылку в браузере.');
  }
}

function userErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Не удалось выполнить команду Kodpauza.';
}

function workspaceRoots(): string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath);
}

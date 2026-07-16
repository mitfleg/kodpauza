import * as vscode from 'vscode';
import { CodexLifecycleEvent } from './codexBridge';
import { StatusBarAdPresenter } from './adPresenter';
import { KodpauzaState } from './state';

const MAX_ACTIVE_TURNS = 100;
const STALE_WAIT_MS = 2 * 60 * 60_000;
const CODEX_EXTENSION_IDS = ['openai.chatgpt'];
const CLAUDE_EXTENSION_IDS = ['anthropic.claude-code'];

export type CodexDetection = {
  detected: boolean;
  extensionId?: string;
  extensionPath?: string;
  version?: string;
};

type ToolLifecycleOptions = {
  name: string;
  surface: 'codex_vscode' | 'claude_code_vscode';
  toolName: string;
  detect: () => CodexDetection;
};

class ToolLifecycleController implements vscode.Disposable {
  private activeTurnsValue = 0;
  private uiActiveValue = false;
  private staleTimer: NodeJS.Timeout | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: KodpauzaState,
    private readonly presenter: StatusBarAdPresenter,
    private readonly options: ToolLifecycleOptions
  ) {}

  get activeTurns(): number {
    return this.activeTurnsValue + Number(this.uiActiveValue);
  }

  handle(event: CodexLifecycleEvent): Promise<void> {
    const operation = this.queue.catch(() => undefined).then(() => this.apply(event));
    this.queue = operation;
    return operation;
  }

  handleUiActivity(active: boolean): Promise<void> {
    const operation = this.queue.catch(() => undefined).then(() => this.applyUiActivity(active));
    this.queue = operation;
    return operation;
  }

  stopAll(): void {
    this.activeTurnsValue = 0;
    this.uiActiveValue = false;
    this.clearStaleTimer();
    this.presenter.stopWait();
  }

  dispose(): void {
    this.stopAll();
  }

  private async apply(event: CodexLifecycleEvent): Promise<void> {
    if (event.event === 'stop') {
      const wasActive = this.activeTurns > 0;
      this.activeTurnsValue = Math.max(0, this.activeTurnsValue - 1);
      if (this.activeTurns === 0) {
        this.clearStaleTimer();
        if (wasActive) {
          this.presenter.stopWait();
        }
      } else {
        this.scheduleStaleReset();
      }
      return;
    }

    if (!this.state.adsEnabled || !this.state.integrationEnabled) {
      return;
    }
    if (this.activeTurns >= MAX_ACTIVE_TURNS) {
      throw new Error(`Слишком много одновременных ожиданий ${this.options.name}.`);
    }

    const wasActive = this.activeTurns > 0;
    this.activeTurnsValue += 1;
    this.scheduleStaleReset();
    if (wasActive) {
      return;
    }

    try {
      await this.startPresenter();
    } catch (error) {
      this.activeTurnsValue = 0;
      this.clearStaleTimer();
      throw error;
    }
  }

  private async applyUiActivity(active: boolean): Promise<void> {
    if (this.uiActiveValue === active) {
      return;
    }

    if (active) {
      if (!this.state.adsEnabled || !this.state.integrationEnabled) {
        return;
      }
      const wasActive = this.activeTurns > 0;
      this.uiActiveValue = true;
      this.scheduleStaleReset();
      if (wasActive) {
        return;
      }
      try {
        await this.startPresenter();
      } catch (error) {
        this.uiActiveValue = false;
        this.clearStaleTimer();
        throw error;
      }
      return;
    }

    const wasActive = this.activeTurns > 0;
    this.uiActiveValue = false;
    if (wasActive && this.activeTurns === 0) {
      this.clearStaleTimer();
      this.presenter.stopWait();
    } else if (this.activeTurns > 0) {
      this.scheduleStaleReset();
    }
  }

  private async startPresenter(): Promise<void> {
    const detected = this.options.detect();
    await this.presenter.startWait({
      surface: this.options.surface,
      toolName: this.options.toolName,
      toolVersion: detected.version ?? 'unknown',
      waitingLabel: `Kodpauza: ${this.options.name} работает`
    });
  }

  private scheduleStaleReset(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => this.stopAll(), STALE_WAIT_MS);
    this.staleTimer.unref();
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = undefined;
    }
  }
}

export class CodexLifecycleController extends ToolLifecycleController {
  constructor(state: KodpauzaState, presenter: StatusBarAdPresenter) {
    super(state, presenter, {
      name: 'Codex',
      surface: 'codex_vscode',
      toolName: 'codex_vscode',
      detect: detectCodexExtension
    });
  }
}

export class ClaudeLifecycleController extends ToolLifecycleController {
  constructor(state: KodpauzaState, presenter: StatusBarAdPresenter) {
    super(state, presenter, {
      name: 'Claude Code',
      surface: 'claude_code_vscode',
      toolName: 'claude_code_vscode',
      detect: detectClaudeExtension
    });
  }
}

export function detectCodexExtension(): CodexDetection {
  return detectExtension(CODEX_EXTENSION_IDS);
}

export function detectClaudeExtension(): CodexDetection {
  return detectExtension(CLAUDE_EXTENSION_IDS);
}

function detectExtension(extensionIds: readonly string[]): CodexDetection {
  const extension = extensionIds
    .map((id) => vscode.extensions.getExtension(id))
    .find((candidate) => Boolean(candidate));
  if (!extension) {
    return { detected: false };
  }
  const version = String(extension.packageJSON?.version ?? '').slice(0, 40) || undefined;
  return {
    detected: true,
    extensionId: extension.id,
    extensionPath: extension.extensionPath,
    version
  };
}

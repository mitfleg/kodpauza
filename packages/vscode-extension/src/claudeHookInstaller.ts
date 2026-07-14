import * as crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultKodpauzaHome } from './codexHookInstaller';

const HOOK_EVENTS = ['UserPromptSubmit', 'Stop'] as const;
const HOOK_SCRIPT_NAME = 'kodpauza-claude-lifecycle-hook.cjs';
const MAX_SETTINGS_BYTES = 2 * 1024 * 1024;

type HookEventName = (typeof HOOK_EVENTS)[number];
type JsonRecord = Record<string, unknown>;

export type ClaudeHookStatus = {
  installed: boolean;
  handlerCount: number;
  settingsPath: string;
  scriptPath: string;
};

export type ClaudeHookMutationResult = ClaudeHookStatus & {
  changed: boolean;
  backupPath?: string;
};

export class ClaudeHookInstaller {
  readonly settingsPath: string;
  readonly scriptPath: string;

  constructor(
    private readonly sourceScriptPath: string,
    claudeHome = defaultClaudeHome(),
    private readonly kodpauzaHome = defaultKodpauzaHome()
  ) {
    this.settingsPath = path.join(claudeHome, 'settings.json');
    this.scriptPath = path.join(kodpauzaHome, HOOK_SCRIPT_NAME);
  }

  async inspect(): Promise<ClaudeHookStatus> {
    const root = await readJsonRoot(this.settingsPath, true);
    const handlerCount = root ? countOwnHandlers(root) : 0;
    return {
      installed: handlerCount === HOOK_EVENTS.length,
      handlerCount,
      settingsPath: this.settingsPath,
      scriptPath: this.scriptPath
    };
  }

  async install(): Promise<ClaudeHookMutationResult> {
    const nodeExecutable = await findNodeExecutable();
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true, mode: 0o700 });
    await fs.mkdir(this.kodpauzaHome, { recursive: true, mode: 0o700 });
    await atomicWrite(this.scriptPath, await fs.readFile(this.sourceScriptPath), 0o700);

    const root = (await readJsonRoot(this.settingsPath, true)) ?? {};
    const next = withInstalledClaudeHooks(root, this.scriptPath, nodeExecutable);
    const changed = JSON.stringify(root) !== JSON.stringify(next);
    const backupPath = changed ? await this.backupSettings() : undefined;
    if (changed) {
      await atomicWrite(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, 0o600);
    }
    return { ...(await this.inspect()), changed, backupPath };
  }

  async remove(): Promise<ClaudeHookMutationResult> {
    const root = await readJsonRoot(this.settingsPath, true);
    if (!root) {
      await fs.rm(this.scriptPath, { force: true }).catch(() => undefined);
      return {
        installed: false,
        handlerCount: 0,
        settingsPath: this.settingsPath,
        scriptPath: this.scriptPath,
        changed: false
      };
    }

    const next = withoutInstalledClaudeHooks(root);
    const changed = JSON.stringify(root) !== JSON.stringify(next);
    const backupPath = changed ? await this.backupSettings() : undefined;
    if (changed) {
      await atomicWrite(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, 0o600);
    }
    await fs.rm(this.scriptPath, { force: true }).catch(() => undefined);
    return { ...(await this.inspect()), changed, backupPath };
  }

  private async backupSettings(): Promise<string | undefined> {
    if (!(await fileExists(this.settingsPath))) {
      return undefined;
    }
    const directory = path.join(this.kodpauzaHome, 'backups');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(directory, `claude-settings-${timestamp}.json`);
    await fs.copyFile(this.settingsPath, backupPath);
    await fs.chmod(backupPath, 0o600).catch(() => undefined);
    return backupPath;
  }
}

export function defaultClaudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
}

export function withInstalledClaudeHooks(
  root: JsonRecord,
  scriptPath: string,
  nodeExecutable = 'node'
): JsonRecord {
  const hooks = cloneHooks(root);
  for (const eventName of HOOK_EVENTS) {
    hooks[eventName] = [
      ...removeOwnHandlers(eventEntries(hooks, eventName)),
      ownHookGroup(eventName, scriptPath, nodeExecutable)
    ];
  }
  return { ...root, hooks };
}

export function withoutInstalledClaudeHooks(root: JsonRecord): JsonRecord {
  const hooks = cloneHooks(root);
  for (const eventName of HOOK_EVENTS) {
    const filtered = removeOwnHandlers(eventEntries(hooks, eventName));
    if (filtered.length > 0) {
      hooks[eventName] = filtered;
    } else {
      delete hooks[eventName];
    }
  }
  return { ...root, hooks };
}

function ownHookGroup(eventName: HookEventName, scriptPath: string, nodeExecutable: string): JsonRecord {
  return {
    hooks: [{
      type: 'command',
      command: nodeExecutable,
      args: [scriptPath, 'claude', eventName === 'UserPromptSubmit' ? 'start' : 'stop'],
      timeout: 2
    }]
  };
}

function removeOwnHandlers(entries: unknown[]): unknown[] {
  return entries.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) {
      return [entry];
    }
    const hooks = entry.hooks.filter((handler) => !isOwnHandler(handler));
    return hooks.length > 0 ? [{ ...entry, hooks }] : [];
  });
}

function countOwnHandlers(root: JsonRecord): number {
  if (!isRecord(root.hooks)) {
    return 0;
  }
  return HOOK_EVENTS.reduce((total, eventName) => {
    const entries = eventEntries(root.hooks as JsonRecord, eventName);
    return total + entries.reduce((count: number, entry: unknown) => {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) {
        return count;
      }
      return count + entry.hooks.filter(isOwnHandler).length;
    }, 0);
  }, 0);
}

function isOwnHandler(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (typeof value.command === 'string' && value.command.includes(HOOK_SCRIPT_NAME)) ||
    (Array.isArray(value.args) && value.args.some((arg) =>
      typeof arg === 'string' && arg.includes(HOOK_SCRIPT_NAME)))
  );
}

function cloneHooks(root: JsonRecord): JsonRecord {
  if (root.hooks === undefined) {
    return {};
  }
  if (!isRecord(root.hooks)) {
    throw new Error('Файл Claude settings.json содержит некорректный раздел hooks. Он не был изменен.');
  }
  return { ...root.hooks };
}

function eventEntries(hooks: JsonRecord, eventName: HookEventName): unknown[] {
  const value = hooks[eventName];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Файл Claude settings.json содержит некорректный раздел ${eventName}.`);
  }
  return value;
}

async function readJsonRoot(filePath: string, optional: boolean): Promise<JsonRecord | undefined> {
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch (error) {
    if (optional && isFileNotFound(error)) {
      return undefined;
    }
    throw error;
  }
  if (stats.size > MAX_SETTINGS_BYTES) {
    throw new Error('Файл Claude settings.json слишком большой. Он не был изменен.');
  }

  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch {
    throw new Error('Файл Claude settings.json поврежден. Он не был изменен.');
  }
  if (!isRecord(value)) {
    throw new Error('Файл Claude settings.json должен содержать JSON-объект.');
  }
  return value;
}

async function findNodeExecutable(): Promise<string> {
  const executableName = process.platform === 'win32' ? 'node.exe' : 'node';
  for (const entry of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(entry, executableName);
    try {
      await fs.access(candidate, process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH without invoking a shell.
    }
  }
  if (path.basename(process.execPath).toLowerCase() === executableName) {
    return process.execPath;
  }
  throw new Error('Для lifecycle hooks Kodpauza нужен Node.js в PATH. Настройки Claude не изменены.');
}

async function atomicWrite(filePath: string, data: string | Buffer, mode: number): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, data, { mode });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, mode).catch(() => undefined);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

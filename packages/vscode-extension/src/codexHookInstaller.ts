import * as crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOK_EVENTS = ['UserPromptSubmit', 'Stop'] as const;
const HOOK_SCRIPT_NAME = 'kodpauza-codex-lifecycle-hook.cjs';
const MAX_HOOKS_FILE_BYTES = 2 * 1024 * 1024;

type HookEventName = (typeof HOOK_EVENTS)[number];
type JsonRecord = Record<string, unknown>;

export type CodexHookStatus = {
  installed: boolean;
  handlerCount: number;
  hooksPath: string;
  scriptPath: string;
};

export type CodexHookMutationResult = CodexHookStatus & {
  changed: boolean;
  backupPath?: string;
};

export class CodexHookInstaller {
  readonly hooksPath: string;
  readonly scriptPath: string;

  constructor(
    private readonly sourceScriptPath: string,
    codexHome = defaultCodexHome(),
    private readonly kodpauzaHome = defaultKodpauzaHome()
  ) {
    this.hooksPath = path.join(codexHome, 'hooks.json');
    this.scriptPath = path.join(kodpauzaHome, HOOK_SCRIPT_NAME);
  }

  async inspect(): Promise<CodexHookStatus> {
    const root = await readJsonRoot(this.hooksPath, true);
    const handlerCount = root ? countOwnHandlers(root) : 0;
    return {
      installed: handlerCount === HOOK_EVENTS.length,
      handlerCount,
      hooksPath: this.hooksPath,
      scriptPath: this.scriptPath
    };
  }

  async install(): Promise<CodexHookMutationResult> {
    const nodeExecutable = await findNodeExecutable();
    await fs.mkdir(path.dirname(this.hooksPath), { recursive: true, mode: 0o700 });
    await fs.mkdir(this.kodpauzaHome, { recursive: true, mode: 0o700 });
    await this.installScript();

    const root = (await readJsonRoot(this.hooksPath, true)) ?? {};
    const next = withInstalledHooks(root, this.scriptPath, nodeExecutable);
    const changed = JSON.stringify(root) !== JSON.stringify(next);
    const backupPath = changed ? await this.backupHooksFile() : undefined;
    if (changed) {
      await atomicWrite(this.hooksPath, `${JSON.stringify(next, null, 2)}\n`, 0o600);
    }

    const status = await this.inspect();
    return { ...status, changed, backupPath };
  }

  async remove(): Promise<CodexHookMutationResult> {
    const root = await readJsonRoot(this.hooksPath, true);
    if (!root) {
      await fs.rm(this.scriptPath, { force: true }).catch(() => undefined);
      return {
        installed: false,
        handlerCount: 0,
        hooksPath: this.hooksPath,
        scriptPath: this.scriptPath,
        changed: false
      };
    }

    const next = withoutInstalledHooks(root);
    const changed = JSON.stringify(root) !== JSON.stringify(next);
    const backupPath = changed ? await this.backupHooksFile() : undefined;
    if (changed) {
      await atomicWrite(this.hooksPath, `${JSON.stringify(next, null, 2)}\n`, 0o600);
    }
    await fs.rm(this.scriptPath, { force: true }).catch(() => undefined);

    const status = await this.inspect();
    return { ...status, changed, backupPath };
  }

  private async installScript(): Promise<void> {
    const script = await fs.readFile(this.sourceScriptPath);
    await atomicWrite(this.scriptPath, script, 0o700);
  }

  private async backupHooksFile(): Promise<string | undefined> {
    if (!(await fileExists(this.hooksPath))) {
      return undefined;
    }
    const backupsDirectory = path.join(this.kodpauzaHome, 'backups');
    await fs.mkdir(backupsDirectory, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupsDirectory, `codex-hooks-${timestamp}.json`);
    await fs.copyFile(this.hooksPath, backupPath);
    await fs.chmod(backupPath, 0o600).catch(() => undefined);
    return backupPath;
  }
}

export function defaultCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
}

export function defaultKodpauzaHome(): string {
  return process.env.KODPAUZA_HOME?.trim() || path.join(os.homedir(), '.kodpauza');
}

export function withInstalledHooks(
  root: JsonRecord,
  scriptPath: string,
  nodeExecutable = 'node',
  platform: NodeJS.Platform = process.platform
): JsonRecord {
  const hooks = cloneHooks(root);
  for (const eventName of HOOK_EVENTS) {
    const entries = eventEntries(hooks, eventName);
    hooks[eventName] = [
      ...removeOwnHandlers(entries),
      ownHookGroup(eventName, scriptPath, nodeExecutable, platform)
    ];
  }
  return { ...root, hooks };
}

export function withoutInstalledHooks(root: JsonRecord): JsonRecord {
  const hooks = cloneHooks(root);
  for (const eventName of HOOK_EVENTS) {
    const entries = eventEntries(hooks, eventName);
    const filtered = removeOwnHandlers(entries);
    if (filtered.length > 0) {
      hooks[eventName] = filtered;
    } else {
      delete hooks[eventName];
    }
  }
  return { ...root, hooks };
}

function ownHookGroup(
  eventName: HookEventName,
  scriptPath: string,
  nodeExecutable: string,
  platform: NodeJS.Platform
): JsonRecord {
  const action = eventName === 'UserPromptSubmit' ? 'start' : 'stop';
  const windowsCommand = `${windowsQuote(nodeExecutable)} ${windowsQuote(scriptPath)} ${action}`;
  const command = platform === 'win32'
    ? windowsCommand
    : `${shellQuote(nodeExecutable)} ${shellQuote(scriptPath)} ${action}`;
  return {
    hooks: [{
      type: 'command',
      command,
      commandWindows: windowsCommand,
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
  const hooks = root.hooks;
  return HOOK_EVENTS.reduce((total, eventName) => {
    const entries = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    return total + entries.reduce((eventTotal: number, entry: unknown) => {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) {
        return eventTotal;
      }
      return eventTotal + entry.hooks.filter(isOwnHandler).length;
    }, 0);
  }, 0);
}

function isOwnHandler(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const commands = [value.command, value.commandWindows];
  return commands.some((command) => typeof command === 'string' && command.includes(HOOK_SCRIPT_NAME));
}

function cloneHooks(root: JsonRecord): JsonRecord {
  if (root.hooks === undefined) {
    return {};
  }
  if (!isRecord(root.hooks)) {
    throw new Error('Файл hooks.json содержит некорректный раздел hooks. Он не был изменен.');
  }
  return { ...root.hooks };
}

function eventEntries(hooks: JsonRecord, eventName: HookEventName): unknown[] {
  const value = hooks[eventName];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Файл hooks.json содержит некорректный раздел ${eventName}. Он не был изменен.`);
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
  if (stats.size > MAX_HOOKS_FILE_BYTES) {
    throw new Error('Файл Codex hooks.json слишком большой. Он не был изменен.');
  }

  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown;
  } catch {
    throw new Error('Файл Codex hooks.json поврежден. Он не был изменен.');
  }
  if (!isRecord(value)) {
    throw new Error('Файл Codex hooks.json должен содержать JSON-объект. Он не был изменен.');
  }
  return value;
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
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findNodeExecutable(): Promise<string> {
  const executableName = process.platform === 'win32' ? 'node.exe' : 'node';
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
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
  throw new Error('Для lifecycle hooks Kodpauza нужен Node.js в PATH. Конфигурация Codex не изменена.');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function windowsQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

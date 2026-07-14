import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';

const MAX_BODY_BYTES = 2_048;
const HEARTBEAT_MS = 30_000;
const STALE_DESCRIPTOR_MS = 5 * 60_000;
const DEFAULT_PORT_RETRY_MS = 1_500;

export type CodexLifecycleEvent = {
  version: 1;
  event: 'start' | 'stop';
  cwd: string;
};

export type IntegrationTool = 'codex' | 'claude';

export type CodexUiAd = {
  active: true;
  adId: string;
  text: string;
  format: 'standard' | 'premium';
};

export type UiVisibilityEvent = {
  adId: string;
  viewId: string;
  visible: boolean;
};

export type CodexHookBridgeOptions = {
  uiPort?: number;
  portRetryMs?: number;
  uiEnabled?: () => boolean;
  uiToken?: () => string | undefined;
  currentAd?: () => CodexUiAd | undefined;
  onAdClick?: (adId: string) => Promise<void>;
  uiAdapters?: Partial<
    Record<
      IntegrationTool,
      {
        token: () => string | undefined;
        currentAd: () => CodexUiAd | undefined;
        onAdClick: (adId: string) => Promise<void>;
        onVisibility?: (event: UiVisibilityEvent) => void;
      }
    >
  >;
};

type BridgeDescriptor = {
  version: 1;
  instanceId: string;
  port: number;
  token: string;
  workspaceRoots: string[];
  updatedAt: string;
};

export class CodexHookBridge {
  private readonly instanceId = crypto.randomUUID();
  private readonly token = crypto.randomBytes(32).toString('hex');
  private server: http.Server | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private portRetry: NodeJS.Timeout | undefined;
  private startPromise: Promise<void> | undefined;
  private shouldRun = false;
  private descriptorWrite: Promise<void> = Promise.resolve();
  private lastErrorValue: string | undefined;

  constructor(
    private readonly kodpauzaHome: string,
    private readonly workspaceRoots: () => string[],
    private readonly onLifecycle: (
      event: CodexLifecycleEvent,
      tool: IntegrationTool,
    ) => Promise<void>,
    private readonly options: CodexHookBridgeOptions = {},
  ) {}

  get isListening(): boolean {
    return Boolean(this.server?.listening);
  }

  get lastError(): string | undefined {
    return this.lastErrorValue;
  }

  async start(): Promise<void> {
    this.shouldRun = true;
    if (this.server?.listening) {
      return;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    const startPromise = this.startServer();
    this.startPromise = startPromise;
    try {
      await startPromise;
    } finally {
      if (this.startPromise === startPromise) {
        this.startPromise = undefined;
      }
    }
  }

  private async startServer(): Promise<void> {
    if (!this.shouldRun || this.server?.listening) {
      return;
    }

    await fs.mkdir(this.bridgesDirectory, { recursive: true, mode: 0o700 });
    await this.cleanupStaleDescriptors();

    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    server.requestTimeout = 2_000;
    server.headersTimeout = 2_000;

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(this.options.uiPort ?? 0, '127.0.0.1');
      });
    } catch (error) {
      if (isAddressInUseError(error) && this.options.uiPort !== undefined) {
        this.lastErrorValue = `Локальный UI bridge уже занят другим окном Cursor (порт ${this.options.uiPort}). В этом окне показы приостановлены до освобождения порта.`;
        this.schedulePortRetry();
        return;
      }
      throw error;
    }

    if (!this.shouldRun) {
      await closeServer(server);
      return;
    }

    this.server = server;
    this.lastErrorValue = undefined;
    try {
      await this.queueDescriptorWrite();
    } catch (error) {
      this.server = undefined;
      await closeServer(server);
      throw error;
    }

    this.heartbeat = setInterval(() => {
      void this.queueDescriptorWrite().catch((error) => {
        this.lastErrorValue = errorMessage(error);
      });
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  async stop(): Promise<void> {
    this.shouldRun = false;
    if (this.portRetry) {
      clearTimeout(this.portRetry);
      this.portRetry = undefined;
    }
    await this.startPromise?.catch(() => undefined);
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }

    const server = this.server;
    this.server = undefined;
    await this.descriptorWrite.catch(() => undefined);
    await fs.rm(this.descriptorPath, { force: true }).catch(() => undefined);
    if (server) {
      await closeServer(server);
    }
  }

  async refresh(): Promise<void> {
    if (this.server?.listening) {
      await this.queueDescriptorWrite();
    }
  }

  dispose(): void {
    void this.stop();
  }

  private get bridgesDirectory(): string {
    return path.join(this.kodpauzaHome, 'bridges');
  }

  private get descriptorPath(): string {
    return path.join(this.bridgesDirectory, `${this.instanceId}.json`);
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const uiMatch = requestUrl.pathname.match(/^\/v1\/(codex|claude)\/ad\//);
    if (uiMatch) {
      await this.handleUiRequest(request, response, requestUrl, uiMatch[1] as IntegrationTool);
      return;
    }

    const lifecycleMatch = requestUrl.pathname.match(/^\/v1\/(codex|claude)\/lifecycle$/);
    if (request.method !== 'POST' || !lifecycleMatch) {
      respond(response, 404);
      request.resume();
      return;
    }

    if (!safeTokenEqual(request.headers.authorization, this.token)) {
      respond(response, 401);
      request.resume();
      return;
    }

    try {
      const body = await readRequestBody(request);
      const event = parseLifecycleEvent(body);
      await this.onLifecycle(event, lifecycleMatch[1] as IntegrationTool);
      this.lastErrorValue = undefined;
      respond(response, 204);
    } catch (error) {
      this.lastErrorValue = errorMessage(error);
      respond(response, error instanceof BodyTooLargeError ? 413 : 400);
    }
  }

  private async handleUiRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
    requestUrl: URL,
    tool: IntegrationTool,
  ): Promise<void> {
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (request.method === 'OPTIONS') {
      request.resume();
      respond(response, 204, corsHeaders);
      return;
    }

    const adapter = this.options.uiAdapters?.[tool];
    const expectedToken =
      adapter?.token() ?? (tool === 'codex' ? this.options.uiToken?.() : undefined);
    if (
      !expectedToken ||
      !safeRawTokenEqual(requestUrl.searchParams.get('token') ?? '', expectedToken)
    ) {
      request.resume();
      respond(response, 401, corsHeaders);
      return;
    }

    if (this.options.uiEnabled?.() === false) {
      request.resume();
      if (request.method === 'GET' && requestUrl.pathname === `/v1/${tool}/ad/current`) {
        respondJson(response, { active: false }, corsHeaders);
      } else {
        respond(response, 409, corsHeaders);
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === `/v1/${tool}/ad/current`) {
      request.resume();
      const ad =
        adapter?.currentAd() ?? (tool === 'codex' ? this.options.currentAd?.() : undefined);
      respondJson(response, ad ?? { active: false }, corsHeaders);
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === `/v1/${tool}/ad/visibility`) {
      try {
        const visibility = parseUiVisibilityEvent(await readRequestBody(request));
        const currentAd =
          adapter?.currentAd() ?? (tool === 'codex' ? this.options.currentAd?.() : undefined);
        if (!currentAd || currentAd.adId !== visibility.adId) {
          respond(response, 409, corsHeaders);
          return;
        }
        adapter?.onVisibility?.(visibility);
        respond(response, 204, corsHeaders);
      } catch (error) {
        this.lastErrorValue = errorMessage(error);
        respond(response, error instanceof BodyTooLargeError ? 413 : 400, corsHeaders);
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === `/v1/${tool}/ad/click`) {
      try {
        const adId = (await readRequestBody(request)).trim();
        if (!adId || adId.length > 200) {
          throw new Error('Некорректный идентификатор объявления.');
        }
        if (adapter) {
          await adapter.onAdClick(adId);
        } else if (tool === 'codex') {
          await this.options.onAdClick?.(adId);
        }
        respond(response, 204, corsHeaders);
      } catch (error) {
        this.lastErrorValue = errorMessage(error);
        respond(response, error instanceof BodyTooLargeError ? 413 : 400, corsHeaders);
      }
      return;
    }

    request.resume();
    respond(response, 404, corsHeaders);
  }

  private queueDescriptorWrite(): Promise<void> {
    this.descriptorWrite = this.descriptorWrite
      .catch(() => undefined)
      .then(async () => {
        const server = this.server;
        if (!server?.listening) {
          return;
        }

        const address = server.address() as AddressInfo | null;
        if (!address || typeof address.port !== 'number') {
          throw new Error('Локальный мост Codex не получил порт.');
        }

        const descriptor: BridgeDescriptor = {
          version: 1,
          instanceId: this.instanceId,
          port: address.port,
          token: this.token,
          workspaceRoots: this.workspaceRoots().map((root) => path.resolve(root)),
          updatedAt: new Date().toISOString(),
        };
        await atomicWrite(this.descriptorPath, JSON.stringify(descriptor), 0o600);
      });
    return this.descriptorWrite;
  }

  private async cleanupStaleDescriptors(): Promise<void> {
    const entries = await fs
      .readdir(this.bridgesDirectory, { withFileTypes: true })
      .catch(() => []);
    const now = Date.now();

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          const descriptorPath = path.join(this.bridgesDirectory, entry.name);
          try {
            const raw = await fs.readFile(descriptorPath, 'utf8');
            const value = JSON.parse(raw) as Partial<BridgeDescriptor>;
            const updatedAt = typeof value.updatedAt === 'string' ? Date.parse(value.updatedAt) : 0;
            if (!Number.isFinite(updatedAt) || now - updatedAt > STALE_DESCRIPTOR_MS) {
              await fs.rm(descriptorPath, { force: true });
            }
          } catch {
            await fs.rm(descriptorPath, { force: true });
          }
        }),
    );
  }

  private schedulePortRetry(): void {
    if (!this.shouldRun || this.portRetry) {
      return;
    }
    this.portRetry = setTimeout(() => {
      this.portRetry = undefined;
      if (!this.shouldRun) {
        return;
      }
      void this.start().catch((error) => {
        this.lastErrorValue = errorMessage(error);
        this.schedulePortRetry();
      });
    }, this.options.portRetryMs ?? DEFAULT_PORT_RETRY_MS);
    this.portRetry.unref();
  }
}

function parseLifecycleEvent(body: string): CodexLifecycleEvent {
  const value = JSON.parse(body) as unknown;
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    (value.event !== 'start' && value.event !== 'stop')
  ) {
    throw new Error('Некорректное событие Codex.');
  }
  if (typeof value.cwd !== 'string' || value.cwd.length === 0 || value.cwd.length > 4_096) {
    throw new Error('Некорректная рабочая папка Codex.');
  }
  return { version: 1, event: value.event, cwd: value.cwd };
}

function parseUiVisibilityEvent(body: string): UiVisibilityEvent {
  const value = JSON.parse(body) as Partial<UiVisibilityEvent>;
  if (
    typeof value.adId !== 'string' ||
    value.adId.length === 0 ||
    value.adId.length > 200 ||
    typeof value.viewId !== 'string' ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(value.viewId) ||
    typeof value.visible !== 'boolean'
  ) {
    throw new Error('Некорректное подтверждение видимости объявления.');
  }
  return { adId: value.adId, viewId: value.viewId, visible: value.visible };
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new BodyTooLargeError();
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeTokenEqual(authorization: string | undefined, expected: string): boolean {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  return safeRawTokenEqual(actual, expected);
}

function safeRawTokenEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function respond(
  response: http.ServerResponse,
  statusCode: number,
  headers: Record<string, string> = {},
): void {
  if (!response.headersSent) {
    response.writeHead(statusCode, { 'cache-control': 'no-store', ...headers });
  }
  response.end();
}

function respondJson(
  response: http.ServerResponse,
  value: unknown,
  headers: Record<string, string>,
): void {
  if (!response.headersSent) {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    });
  }
  response.end(JSON.stringify(value));
}

async function atomicWrite(filePath: string, data: string, mode: number): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, data, { encoding: 'utf8', mode });
  await fs.rename(temporaryPath, filePath);
  await fs.chmod(filePath, mode).catch(() => undefined);
}

async function closeServer(server: http.Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
}

class BodyTooLargeError extends Error {}

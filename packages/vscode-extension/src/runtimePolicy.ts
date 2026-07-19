import * as crypto from 'node:crypto';

export const RUNTIME_POLICY_PUBLIC_KEY_DER_BASE64 =
  'MCowBQYDK2VwAyEAXx+hrfGt2qGrvw5TwKLJ0vKizBxCN7kfO6idRBCmeN4=';
const MAX_POLICY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type RuntimePolicyTool = 'codex' | 'claude';
export type RuntimePolicySurface = 'codex_vscode' | 'claude_code_vscode';

export interface RuntimePolicyPayload {
  schemaVersion: 1;
  policyVersion: string;
  environment: 'production' | 'development';
  issuedAt: string;
  expiresAt: string;
  enabled: boolean;
  blocks: {
    tools: RuntimePolicyTool[];
    toolVersions: Array<{ tool: RuntimePolicyTool; version: string }>;
    surfaces: RuntimePolicySurface[];
    campaigns: string[];
  };
}

export interface RuntimePolicyEnvelope {
  algorithm: 'Ed25519' | 'none';
  keyId: string;
  payload: string;
  signature: string;
}

export interface RuntimePolicyStore {
  get(): Promise<unknown> | unknown;
  set(value: RuntimePolicyEnvelope): Promise<void> | void;
}

export interface RuntimePolicyDecisionContext {
  tool: RuntimePolicyTool;
  version?: string;
  surface?: RuntimePolicySurface;
  campaignId?: string;
}

export class RuntimePolicyManager {
  private current: RuntimePolicyPayload | undefined;
  private lastErrorValue: string | undefined;

  constructor(
    private readonly fetchEnvelope: () => Promise<unknown>,
    private readonly store: RuntimePolicyStore,
    private readonly options: {
      publicKeyDerBase64?: string;
      allowUnsignedLocalDevelopment?: boolean;
      now?: () => number;
    } = {},
  ) {}

  get policy(): RuntimePolicyPayload | undefined {
    return this.isUsable(this.current) ? this.current : undefined;
  }

  get lastError(): string | undefined {
    return this.lastErrorValue;
  }

  async loadCached(): Promise<boolean> {
    try {
      const cached = this.verifyEnvelope(await this.store.get());
      this.current = cached.payload;
      this.lastErrorValue = undefined;
      return true;
    } catch {
      this.current = undefined;
      return false;
    }
  }

  async refresh(): Promise<boolean> {
    try {
      const verified = this.verifyEnvelope(await this.fetchEnvelope());
      this.current = verified.payload;
      await this.store.set(verified.envelope);
      this.lastErrorValue = undefined;
      return true;
    } catch (error) {
      this.lastErrorValue = error instanceof Error ? error.message : String(error);
    }

    const refreshError = this.lastErrorValue;
    const loaded = await this.loadCached();
    if (loaded) this.lastErrorValue = refreshError;
    return loaded;
  }

  canPatch(context: Pick<RuntimePolicyDecisionContext, 'tool' | 'version'>): boolean {
    const policy = this.policy;
    if (!policy || !policy.enabled || policy.blocks.tools.includes(context.tool)) return false;
    const blockedVersions = policy.blocks.toolVersions.filter(
      (blocked) => blocked.tool === context.tool,
    );
    if (blockedVersions.length === 0) return true;
    if (!context.version) return false;
    return !blockedVersions.some((blocked) => blocked.version === context.version);
  }

  canServe(context: RuntimePolicyDecisionContext): boolean {
    const policy = this.policy;
    if (!policy || !this.canPatch(context)) return false;
    if (context.surface && policy.blocks.surfaces.includes(context.surface)) return false;
    if (context.campaignId && policy.blocks.campaigns.includes(context.campaignId)) return false;
    return true;
  }

  private verifyEnvelope(value: unknown): {
    envelope: RuntimePolicyEnvelope;
    payload: RuntimePolicyPayload;
  } {
    const envelope = parseEnvelope(value);
    const payloadBytes = Buffer.from(envelope.payload, 'base64url');
    if (payloadBytes.length === 0 || payloadBytes.toString('base64url') !== envelope.payload) {
      throw new Error('Runtime policy payload encoding is invalid.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadBytes.toString('utf8'));
    } catch {
      throw new Error('Runtime policy payload is not valid JSON.');
    }
    const payload = parsePayload(parsed);

    if (envelope.algorithm === 'none') {
      if (!this.options.allowUnsignedLocalDevelopment || payload.environment !== 'development') {
        throw new Error('Unsigned runtime policy is forbidden.');
      }
    } else {
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(
          this.options.publicKeyDerBase64 ?? RUNTIME_POLICY_PUBLIC_KEY_DER_BASE64,
          'base64',
        ),
        format: 'der',
        type: 'spki',
      });
      const valid = crypto.verify(
        null,
        Buffer.from(envelope.payload, 'utf8'),
        publicKey,
        Buffer.from(envelope.signature, 'base64url'),
      );
      if (!valid) throw new Error('Runtime policy signature is invalid.');
    }

    if (!this.isUsable(payload)) throw new Error('Runtime policy is expired or not yet valid.');
    return { envelope, payload };
  }

  private isUsable(payload: RuntimePolicyPayload | undefined): payload is RuntimePolicyPayload {
    if (!payload) return false;
    const issuedAt = Date.parse(payload.issuedAt);
    const expiresAt = Date.parse(payload.expiresAt);
    const now = this.options.now?.() ?? Date.now();
    return (
      Number.isFinite(issuedAt) &&
      Number.isFinite(expiresAt) &&
      issuedAt <= now + MAX_CLOCK_SKEW_MS &&
      expiresAt > now &&
      expiresAt > issuedAt &&
      expiresAt - issuedAt <= MAX_POLICY_TTL_MS
    );
  }
}

export function isLocalRuntimePolicyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1')
    );
  } catch {
    return false;
  }
}

export function toolForSurface(surface: RuntimePolicySurface): RuntimePolicyTool {
  return surface === 'claude_code_vscode' ? 'claude' : 'codex';
}

function parseEnvelope(value: unknown): RuntimePolicyEnvelope {
  if (!isRecord(value)) throw new Error('Runtime policy envelope is invalid.');
  if (
    (value.algorithm !== 'Ed25519' && value.algorithm !== 'none') ||
    typeof value.keyId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(value.keyId) ||
    typeof value.payload !== 'string' ||
    value.payload.length < 10 ||
    value.payload.length > 32_000 ||
    typeof value.signature !== 'string' ||
    (value.algorithm === 'Ed25519' && value.signature.length < 40) ||
    (value.algorithm === 'none' && value.signature !== '')
  ) {
    throw new Error('Runtime policy envelope is invalid.');
  }
  return {
    algorithm: value.algorithm,
    keyId: value.keyId,
    payload: value.payload,
    signature: value.signature,
  };
}

function parsePayload(value: unknown): RuntimePolicyPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.policyVersion !== 'string' ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(value.policyVersion) ||
    (value.environment !== 'production' && value.environment !== 'development') ||
    typeof value.issuedAt !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    !isRecord(value.blocks)
  ) {
    throw new Error('Runtime policy payload is invalid.');
  }

  const tools = parseStringArray(value.blocks.tools, isTool);
  const surfaces = parseStringArray(value.blocks.surfaces, isSurface);
  const campaigns = parseStringArray(value.blocks.campaigns, isIdentifier);
  if (!Array.isArray(value.blocks.toolVersions) || value.blocks.toolVersions.length > 500) {
    throw new Error('Runtime policy tool version blocks are invalid.');
  }
  const toolVersions = value.blocks.toolVersions.map((entry) => {
    if (
      !isRecord(entry) ||
      !isTool(entry.tool) ||
      typeof entry.version !== 'string' ||
      !/^[A-Za-z0-9._+-]{1,80}$/.test(entry.version)
    ) {
      throw new Error('Runtime policy tool version block is invalid.');
    }
    return { tool: entry.tool, version: entry.version };
  });

  return {
    schemaVersion: 1,
    policyVersion: value.policyVersion,
    environment: value.environment,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    enabled: value.enabled,
    blocks: { tools, toolVersions, surfaces, campaigns },
  };
}

function parseStringArray<T extends string>(
  value: unknown,
  predicate: (entry: unknown) => entry is T,
): T[] {
  if (!Array.isArray(value) || value.length > 500 || !value.every(predicate)) {
    throw new Error('Runtime policy block list is invalid.');
  }
  return [...new Set(value)];
}

function isTool(value: unknown): value is RuntimePolicyTool {
  return value === 'codex' || value === 'claude';
}

function isSurface(value: unknown): value is RuntimePolicySurface {
  return value === 'codex_vscode' || value === 'claude_code_vscode';
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

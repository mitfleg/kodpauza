import crypto from 'node:crypto';
import { config } from '../config.js';
import {
  RUNTIME_POLICY_ALGORITHM,
  RUNTIME_POLICY_SCHEMA_VERSION,
  RUNTIME_POLICY_UNSIGNED_ALGORITHM,
} from '../runtimePolicyConstants.js';

export type RuntimePolicyTool = 'codex' | 'claude';
export type RuntimePolicySurface = 'codex_vscode' | 'claude_code_vscode';

export interface RuntimePolicyPayload {
  schemaVersion: typeof RUNTIME_POLICY_SCHEMA_VERSION;
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
  algorithm: typeof RUNTIME_POLICY_ALGORITHM | typeof RUNTIME_POLICY_UNSIGNED_ALGORITHM;
  keyId: string;
  payload: string;
  signature: string;
}

export interface RuntimePolicySource {
  nodeEnv: string;
  version: string;
  ttlMs: number;
  enabled: boolean;
  blockedTools: string[];
  blockedToolVersions: string[];
  blockedSurfaces: string[];
  blockedCampaigns: string[];
  privateKeyBase64: string;
  keyId: string;
}

export interface RuntimePolicyDecisionContext {
  tool: RuntimePolicyTool;
  version?: string;
  surface?: RuntimePolicySurface;
  campaignId?: string;
}

export function createRuntimePolicyEnvelope(
  source: RuntimePolicySource = runtimePolicySource(),
  now = new Date(),
): RuntimePolicyEnvelope {
  const payload = createRuntimePolicyPayload(source, now);
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  if (!source.privateKeyBase64) {
    if (source.nodeEnv === 'production') {
      throw new Error('Runtime policy signing key is not configured.');
    }
    return {
      algorithm: RUNTIME_POLICY_UNSIGNED_ALGORITHM,
      keyId: 'local-development',
      payload: encodedPayload,
      signature: '',
    };
  }

  const signature = crypto.sign(
    null,
    Buffer.from(encodedPayload, 'utf8'),
    privateKeyFromBase64(source.privateKeyBase64),
  );
  return {
    algorithm: RUNTIME_POLICY_ALGORITHM,
    keyId: source.keyId,
    payload: encodedPayload,
    signature: signature.toString('base64url'),
  };
}

export function createRuntimePolicyPayload(
  source: RuntimePolicySource = runtimePolicySource(),
  now = new Date(),
): RuntimePolicyPayload {
  return {
    schemaVersion: RUNTIME_POLICY_SCHEMA_VERSION,
    policyVersion: source.version,
    environment: source.nodeEnv === 'production' ? 'production' : 'development',
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + source.ttlMs).toISOString(),
    enabled: source.enabled,
    blocks: {
      tools: source.blockedTools.filter(isRuntimePolicyTool),
      toolVersions: source.blockedToolVersions.flatMap(parseBlockedToolVersion),
      surfaces: source.blockedSurfaces.filter(isRuntimePolicySurface),
      campaigns: source.blockedCampaigns.filter(isSafeIdentifier),
    },
  };
}

export function runtimePolicyAllows(
  context: RuntimePolicyDecisionContext,
  payload = createRuntimePolicyPayload(),
): boolean {
  if (!payload.enabled || payload.blocks.tools.includes(context.tool)) return false;
  const blockedVersions = payload.blocks.toolVersions.filter(
    (blocked) => blocked.tool === context.tool,
  );
  if (
    blockedVersions.length > 0 &&
    (!context.version || blockedVersions.some((blocked) => blocked.version === context.version))
  ) {
    return false;
  }
  if (context.surface && payload.blocks.surfaces.includes(context.surface)) return false;
  if (context.campaignId && payload.blocks.campaigns.includes(context.campaignId)) return false;
  return true;
}

export function runtimeToolForSurface(surface: RuntimePolicySurface): RuntimePolicyTool {
  return surface === 'claude_code_vscode' ? 'claude' : 'codex';
}

export function decodeRuntimePolicyPrivateKey(privateKeyBase64: string): crypto.KeyObject {
  return privateKeyFromBase64(privateKeyBase64);
}

function runtimePolicySource(): RuntimePolicySource {
  return {
    nodeEnv: config.nodeEnv,
    version: config.runtimePolicyVersion,
    ttlMs: config.runtimePolicyTtlMs,
    enabled: config.runtimePolicyEnabled,
    blockedTools: config.runtimePolicyBlockedTools,
    blockedToolVersions: config.runtimePolicyBlockedToolVersions,
    blockedSurfaces: config.runtimePolicyBlockedSurfaces,
    blockedCampaigns: config.runtimePolicyBlockedCampaigns,
    privateKeyBase64: config.runtimePolicyPrivateKeyBase64,
    keyId: config.runtimePolicyKeyId,
  };
}

function privateKeyFromBase64(value: string): crypto.KeyObject {
  const pem = Buffer.from(value, 'base64').toString('utf8');
  return crypto.createPrivateKey(pem);
}

function parseBlockedToolVersion(value: string): Array<{ tool: RuntimePolicyTool; version: string }> {
  const separator = value.indexOf('@');
  if (separator <= 0) return [];
  const tool = value.slice(0, separator);
  const version = value.slice(separator + 1);
  return isRuntimePolicyTool(tool) && isSafeVersion(version) ? [{ tool, version }] : [];
}

function isRuntimePolicyTool(value: string): value is RuntimePolicyTool {
  return value === 'codex' || value === 'claude';
}

function isRuntimePolicySurface(value: string): value is RuntimePolicySurface {
  return value === 'codex_vscode' || value === 'claude_code_vscode';
}

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function isSafeVersion(value: string): boolean {
  return /^[A-Za-z0-9._+-]{1,80}$/.test(value);
}

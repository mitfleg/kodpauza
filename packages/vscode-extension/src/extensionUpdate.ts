import * as crypto from 'node:crypto';
import { RUNTIME_POLICY_PUBLIC_KEY_DER_BASE64 } from './runtimePolicy';

const EXTENSION_ID = 'kodpauza.kodpauza-vscode';
const MAX_MANIFEST_TTL_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ExtensionUpdatePayload {
  schemaVersion: 1;
  extensionId: typeof EXTENSION_ID;
  version: string;
  downloadUrl: string;
  sha256: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ExtensionUpdateEnvelope {
  algorithm: 'Ed25519' | 'none';
  keyId: string;
  payload: string;
  signature: string;
}

export function verifyExtensionUpdateEnvelope(
  value: unknown,
  options: {
    trustedBaseUrl: string;
    publicKeyDerBase64?: string;
    allowUnsignedLocalDevelopment?: boolean;
    now?: () => number;
  },
): ExtensionUpdatePayload {
  const envelope = parseEnvelope(value);
  const payloadBytes = Buffer.from(envelope.payload, 'base64url');
  if (payloadBytes.length === 0 || payloadBytes.toString('base64url') !== envelope.payload) {
    throw new Error('Extension update payload encoding is invalid.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    throw new Error('Extension update payload is not valid JSON.');
  }
  const payload = parsePayload(parsed, options.trustedBaseUrl);

  if (envelope.algorithm === 'none') {
    if (!options.allowUnsignedLocalDevelopment || !isLocalUrl(payload.downloadUrl)) {
      throw new Error('Unsigned extension update is forbidden.');
    }
  } else {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(
        options.publicKeyDerBase64 ?? RUNTIME_POLICY_PUBLIC_KEY_DER_BASE64,
        'base64',
      ),
      format: 'der',
      type: 'spki',
    });
    if (
      !crypto.verify(
        null,
        Buffer.from(envelope.payload, 'utf8'),
        publicKey,
        Buffer.from(envelope.signature, 'base64url'),
      )
    ) {
      throw new Error('Extension update signature is invalid.');
    }
  }

  const now = options.now?.() ?? Date.now();
  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > now + MAX_CLOCK_SKEW_MS ||
    expiresAt <= now ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_MANIFEST_TTL_MS
  ) {
    throw new Error('Extension update manifest is expired or not yet valid.');
  }
  return payload;
}

export function isNewerExtensionVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

export function editorInstallMarkerKey(appName: string): 'vscode' | 'cursor' | 'vscodium' {
  const normalized = appName.toLowerCase();
  if (normalized.includes('cursor')) return 'cursor';
  if (normalized.includes('codium')) return 'vscodium';
  return 'vscode';
}

function parseEnvelope(value: unknown): ExtensionUpdateEnvelope {
  if (
    !isRecord(value) ||
    (value.algorithm !== 'Ed25519' && value.algorithm !== 'none') ||
    typeof value.keyId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,120}$/u.test(value.keyId) ||
    typeof value.payload !== 'string' ||
    value.payload.length < 10 ||
    value.payload.length > 8_000 ||
    typeof value.signature !== 'string' ||
    (value.algorithm === 'Ed25519' && value.signature.length < 40) ||
    (value.algorithm === 'none' && value.signature !== '')
  ) {
    throw new Error('Extension update envelope is invalid.');
  }
  return {
    algorithm: value.algorithm,
    keyId: value.keyId,
    payload: value.payload,
    signature: value.signature,
  };
}

function parsePayload(value: unknown, trustedBaseUrl: string): ExtensionUpdatePayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.extensionId !== EXTENSION_ID ||
    typeof value.version !== 'string' ||
    !parseVersion(value.version) ||
    typeof value.downloadUrl !== 'string' ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) ||
    typeof value.issuedAt !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    throw new Error('Extension update payload is invalid.');
  }

  const expectedUrl = new URL(
    `/v1/extension/download/${encodeURIComponent(value.version)}`,
    trustedBaseUrl,
  );
  const downloadUrl = new URL(value.downloadUrl);
  if (
    downloadUrl.origin !== expectedUrl.origin ||
    downloadUrl.pathname !== expectedUrl.pathname ||
    downloadUrl.search !== '' ||
    downloadUrl.hash !== '' ||
    (downloadUrl.protocol !== 'https:' && !isLocalUrl(downloadUrl.toString()))
  ) {
    throw new Error('Extension update download URL is not trusted.');
  }

  return {
    schemaVersion: 1,
    extensionId: EXTENSION_ID,
    version: value.version,
    downloadUrl: downloadUrl.toString(),
    sha256: value.sha256,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  };
}

function parseVersion(value: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(value);
  if (!match) return undefined;
  const parts = match.slice(1, 4).map(Number);
  if (!parts.every((part) => Number.isSafeInteger(part) && part >= 0)) return undefined;
  return [parts[0], parts[1], parts[2]];
}

function isLocalUrl(value: string): boolean {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

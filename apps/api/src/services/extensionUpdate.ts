import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import {
  RUNTIME_POLICY_ALGORITHM,
  RUNTIME_POLICY_UNSIGNED_ALGORITHM,
} from '../runtimePolicyConstants.js';
import { decodeRuntimePolicyPrivateKey } from './runtimePolicy.js';

const EXTENSION_ID = 'kodpauza.kodpauza-vscode';
const MANIFEST_TTL_MS = 15 * 60 * 1000;
const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

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
  algorithm: typeof RUNTIME_POLICY_ALGORITHM | typeof RUNTIME_POLICY_UNSIGNED_ALGORITHM;
  keyId: string;
  payload: string;
  signature: string;
}

export interface ExtensionUpdateSource {
  nodeEnv: string;
  publicApiUrl: string;
  artifactDirectory: string;
  privateKeyBase64: string;
  keyId: string;
}

export interface ExtensionUpdateArtifact {
  version: string;
  bytes: Buffer;
  sha256: string;
}

type ArtifactProvider = (source: ExtensionUpdateSource) => Promise<ExtensionUpdateArtifact>;

export async function createExtensionUpdateEnvelope(
  source: ExtensionUpdateSource = extensionUpdateSource(),
  artifactProvider: ArtifactProvider = loadExtensionUpdateArtifact,
  now = new Date(),
): Promise<ExtensionUpdateEnvelope> {
  const payload = await createExtensionUpdatePayload(source, artifactProvider, now);
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  if (!source.privateKeyBase64) {
    if (source.nodeEnv === 'production') {
      throw new Error('Extension update signing key is not configured.');
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
    decodeRuntimePolicyPrivateKey(source.privateKeyBase64),
  );
  return {
    algorithm: RUNTIME_POLICY_ALGORITHM,
    keyId: `${source.keyId}-extension-update`,
    payload: encodedPayload,
    signature: signature.toString('base64url'),
  };
}

export async function createExtensionUpdatePayload(
  source: ExtensionUpdateSource = extensionUpdateSource(),
  artifactProvider: ArtifactProvider = loadExtensionUpdateArtifact,
  now = new Date(),
): Promise<ExtensionUpdatePayload> {
  const artifact = await artifactProvider(source);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(artifact.version)) {
    throw new Error('Extension update version is invalid.');
  }
  if (!/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
    throw new Error('Extension update checksum is invalid.');
  }
  if (artifact.bytes.length === 0 || artifact.bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error('Extension update artifact size is invalid.');
  }

  return {
    schemaVersion: 1,
    extensionId: EXTENSION_ID,
    version: artifact.version,
    downloadUrl: new URL(
      `/v1/extension/download/${encodeURIComponent(artifact.version)}`,
      source.publicApiUrl,
    ).toString(),
    sha256: artifact.sha256,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MANIFEST_TTL_MS).toISOString(),
  };
}

export async function loadExtensionUpdateArtifact(
  source: ExtensionUpdateSource = extensionUpdateSource(),
): Promise<ExtensionUpdateArtifact> {
  const versionPath = path.join(source.artifactDirectory, 'kodpauza-version.txt');
  const vsixPath = path.join(source.artifactDirectory, 'kodpauza.vsix');
  const [versionFile, bytes] = await Promise.all([
    fs.readFile(versionPath, 'utf8'),
    fs.readFile(vsixPath),
  ]);
  if (bytes.length === 0 || bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error('Extension update artifact size is invalid.');
  }
  return {
    version: versionFile.trim(),
    bytes,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function extensionUpdateSource(): ExtensionUpdateSource {
  return {
    nodeEnv: config.nodeEnv,
    publicApiUrl: config.publicApiUrl,
    artifactDirectory: config.extensionArtifactDirectory,
    privateKeyBase64: config.runtimePolicyPrivateKeyBase64,
    keyId: config.runtimePolicyKeyId,
  };
}

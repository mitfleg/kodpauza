import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createExtensionUpdateEnvelope,
  createExtensionUpdatePayload,
  type ExtensionUpdateSource,
} from '../src/services/extensionUpdate.js';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const CHECKSUM = 'a'.repeat(64);

function source(overrides: Partial<ExtensionUpdateSource> = {}): ExtensionUpdateSource {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    nodeEnv: 'production',
    publicApiUrl: 'https://api.kodpauza.ru',
    artifactDirectory: '/app/artifacts',
    privateKeyBase64: Buffer.from(
      privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
      'utf8',
    ).toString('base64'),
    keyId: 'test-key',
    ...overrides,
  };
}

const artifact = async () => ({
  version: '0.7.19',
  bytes: Buffer.from('signed-api-image-artifact'),
  sha256: CHECKSUM,
});

describe('extension update manifest', () => {
  it('signs the exact version, API URL and checksum bundled in the API image', async () => {
    const pair = crypto.generateKeyPairSync('ed25519');
    const privateKeyBase64 = Buffer.from(
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
      'utf8',
    ).toString('base64');
    const envelope = await createExtensionUpdateEnvelope(
      source({ privateKeyBase64 }),
      artifact,
      NOW,
    );
    expect(envelope.algorithm).toBe('Ed25519');
    expect(envelope.keyId).toBe('test-key-extension-update');
    expect(
      crypto.verify(
        null,
        Buffer.from(envelope.payload, 'utf8'),
        pair.publicKey,
        Buffer.from(envelope.signature, 'base64url'),
      ),
    ).toBe(true);
    const payload = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8'));
    expect(payload).toMatchObject({
      schemaVersion: 1,
      extensionId: 'kodpauza.kodpauza-vscode',
      version: '0.7.19',
      downloadUrl: 'https://api.kodpauza.ru/v1/extension/download/0.7.19',
      sha256: CHECKSUM,
    });
  });

  it('rejects malformed bundled artifact metadata instead of signing it', async () => {
    const malformed = async () => ({
      version: 'latest',
      bytes: Buffer.from('bad'),
      sha256: 'not-a-checksum',
    });
    await expect(createExtensionUpdatePayload(source(), malformed, NOW)).rejects.toThrow();
  });

  it('permits unsigned manifests only in local development', async () => {
    const envelope = await createExtensionUpdateEnvelope(
      source({
        nodeEnv: 'development',
        privateKeyBase64: '',
        publicApiUrl: 'http://localhost:4000',
      }),
      artifact,
      NOW,
    );
    expect(envelope.algorithm).toBe('none');
    await expect(
      createExtensionUpdateEnvelope(source({ privateKeyBase64: '' }), artifact, NOW),
    ).rejects.toThrow(/signing key/i);
  });
});

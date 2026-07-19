import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createRuntimePolicyEnvelope,
  createRuntimePolicyPayload,
  runtimePolicyAllows,
  type RuntimePolicySource,
} from '../src/services/runtimePolicy.js';

function source(overrides: Partial<RuntimePolicySource> = {}): RuntimePolicySource {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    nodeEnv: 'production',
    version: 'test-1',
    ttlMs: 15 * 60 * 1000,
    enabled: true,
    blockedTools: [],
    blockedToolVersions: [],
    blockedSurfaces: [],
    blockedCampaigns: [],
    privateKeyBase64: Buffer.from(
      privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
      'utf8',
    ).toString('base64'),
    keyId: 'test-key',
    ...overrides,
  };
}

describe('runtime policy API', () => {
  it('signs the exact encoded payload with Ed25519', () => {
    const pair = crypto.generateKeyPairSync('ed25519');
    const privateKeyBase64 = Buffer.from(
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
      'utf8',
    ).toString('base64');
    const envelope = createRuntimePolicyEnvelope(
      source({ privateKeyBase64 }),
      new Date('2026-07-19T12:00:00.000Z'),
    );

    expect(envelope.algorithm).toBe('Ed25519');
    expect(
      crypto.verify(
        null,
        Buffer.from(envelope.payload, 'utf8'),
        pair.publicKey,
        Buffer.from(envelope.signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('permits unsigned output only outside production', () => {
    expect(
      createRuntimePolicyEnvelope(source({ nodeEnv: 'development', privateKeyBase64: '' })).algorithm,
    ).toBe('none');
    expect(() =>
      createRuntimePolicyEnvelope(source({ nodeEnv: 'production', privateKeyBase64: '' })),
    ).toThrow(/signing key/i);
  });

  it('enforces global, tool, exact version, surface and campaign blocks', () => {
    const payload = createRuntimePolicyPayload(
      source({
        blockedTools: ['claude'],
        blockedToolVersions: ['codex@26.707.91948'],
        blockedSurfaces: ['codex_vscode'],
        blockedCampaigns: ['campaign-a'],
      }),
    );
    expect(runtimePolicyAllows({ tool: 'claude' }, payload)).toBe(false);
    expect(runtimePolicyAllows({ tool: 'codex', version: '26.707.91948' }, payload)).toBe(false);
    expect(runtimePolicyAllows({ tool: 'codex' }, payload)).toBe(false);
    expect(runtimePolicyAllows({ tool: 'codex', surface: 'codex_vscode' }, payload)).toBe(false);
    expect(runtimePolicyAllows({ tool: 'codex', campaignId: 'campaign-a' }, payload)).toBe(false);
    expect(runtimePolicyAllows({ tool: 'codex', version: 'other' }, payload)).toBe(true);
    expect(runtimePolicyAllows({ tool: 'codex' }, { ...payload, enabled: false })).toBe(false);
  });
});

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extensionInstallSchema } from '../src/routes/developer.js';

const legacyHeartbeat = {
  installId: randomUUID(),
  vscodeVersion: '1.102.0',
  extensionVersion: '0.7.14',
  os: 'win32',
  integrationsEnabled: true,
  codexDetected: true,
  claudeDetected: false,
};

describe('extension heartbeat telemetry', () => {
  it('keeps legacy clients valid', () => {
    expect(extensionInstallSchema.safeParse(legacyHeartbeat).success).toBe(true);
  });

  it('accepts bounded privacy-safe patch telemetry', () => {
    const parsed = extensionInstallSchema.safeParse({
      ...legacyHeartbeat,
      heartbeatSchemaVersion: 2,
      editorName: 'Visual Studio Code',
      codexVersion: '26.707.91948',
      codexPatchStatus: 'installed_structural',
      codexPatchErrorCategory: 'verification',
    });
    expect(parsed.success).toBe(true);
    expect(
      extensionInstallSchema.safeParse({
        ...legacyHeartbeat,
        codexPatchStatus: 'installed_exact',
        codexPatchErrorCategory: null,
      }).success,
    ).toBe(true);
  });

  it('rejects raw error text and arbitrary patch categories', () => {
    expect(
      extensionInstallSchema.safeParse({
        ...legacyHeartbeat,
        codexPatchStatus: 'broken somehow',
        codexPatchError: '/Users/person/private-project/source.ts failed',
      }).success,
    ).toBe(false);
  });
});

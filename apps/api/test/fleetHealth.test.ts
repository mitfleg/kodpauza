import { describe, expect, it } from 'vitest';
import { aggregateFleet, classifyFleetInstall } from '../src/services/fleetHealth.js';

const now = new Date('2026-07-19T12:00:00.000Z');
const healthy = {
  extensionVersion: '0.7.14',
  vscodeVersion: '1.102.0',
  os: 'win32',
  integrationsEnabled: true,
  codexDetected: true,
  claudeDetected: false,
  lastSeenAt: new Date('2026-07-19T11:55:00.000Z'),
};

describe('fleet health', () => {
  it('separates active, degraded and stale installs without personal identifiers', () => {
    expect(classifyFleetInstall(healthy, now)).toBe('active');
    expect(classifyFleetInstall({ ...healthy, integrationsEnabled: false }, now)).toBe('degraded');
    expect(classifyFleetInstall({ ...healthy, codexPatchStatus: 'error' }, now)).toBe('degraded');
    expect(
      classifyFleetInstall(
        {
          ...healthy,
          codexDetected: false,
          claudeDetected: true,
          codexPatchStatus: 'error',
          claudePatchStatus: 'installed_exact',
        },
        now,
      ),
    ).toBe('active');
    expect(
      classifyFleetInstall({ ...healthy, lastSeenAt: new Date('2026-07-18T11:00:00.000Z') }, now),
    ).toBe('stale');
  });

  it('aggregates versions and detected tools', () => {
    const result = aggregateFleet([
      healthy,
      {
        ...healthy,
        editorName: 'Cursor',
        claudeDetected: true,
        extensionVersion: '0.7.13',
      },
    ], now);
    expect(result.counts).toEqual({ total: 2, active: 2, degraded: 0, stale: 0 });
    expect(result.tools).toEqual({ codex: 2, claude: 1 });
    expect(result.versions).toEqual([
      { name: '0.7.13', count: 1 },
      { name: '0.7.14', count: 1 },
    ]);
    expect(result.editors).toEqual([
      { name: 'Cursor', count: 1 },
      { name: 'VS Code compatible', count: 1 },
    ]);
  });
});

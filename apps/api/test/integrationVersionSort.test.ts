import { describe, expect, it } from 'vitest';
import {
  compareIntegrationVersionReports,
  type ClassifiedIntegrationVersionReport,
} from '../src/services/integrationVersionPolicy.js';

function report(
  id: string,
  overrides: Partial<ClassifiedIntegrationVersionReport> = {},
): ClassifiedIntegrationVersionReport {
  return {
    id,
    tool: 'codex',
    version: '26.1.0',
    supported: false,
    compatibilityMode: 'unsupported',
    attention: 'new_patch',
    acknowledgedAt: null,
    lastSeenAt: new Date('2026-08-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('сортировка версий интеграций в админке', () => {
  it('ставит требующие решения версии перед совместимыми и архивом', () => {
    const reports = [
      report('archive', { acknowledgedAt: new Date('2026-08-02T10:00:00.000Z') }),
      report('structural', {
        supported: true,
        compatibilityMode: 'structural',
        lastSeenAt: new Date('2026-08-05T10:00:00.000Z'),
      }),
      report('outdated', { attention: 'outdated_tool' }),
      report('exact', { supported: true, compatibilityMode: 'exact' }),
      report('new-patch'),
    ].sort(compareIntegrationVersionReports);

    expect(reports.map((item) => item.id)).toEqual([
      'new-patch',
      'outdated',
      'structural',
      'exact',
      'archive',
    ]);
  });

  it('внутри одного приоритета показывает сначала свежий сигнал', () => {
    const reports = [
      report('older', { lastSeenAt: new Date('2026-08-01T10:00:00.000Z') }),
      report('newer', { lastSeenAt: new Date('2026-08-05T10:00:00.000Z') }),
    ].sort(compareIntegrationVersionReports);

    expect(reports.map((item) => item.id)).toEqual(['newer', 'older']);
  });
});

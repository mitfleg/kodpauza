import { describe, expect, it } from 'vitest';
import { classifyUnsupportedIntegrationVersion } from '../src/services/integrationVersionPolicy.js';

describe('classifyUnsupportedIntegrationVersion', () => {
  it('не требует новый патч для старых версий Codex и Claude Code', () => {
    expect(classifyUnsupportedIntegrationVersion('codex', '26.616.71553')).toEqual({
      attention: 'outdated_tool',
      latestExactVersion: '26.818.61809',
    });
    expect(classifyUnsupportedIntegrationVersion('claude', '2.1.173')).toEqual({
      attention: 'outdated_tool',
      latestExactVersion: '2.1.245',
    });
  });

  it('требует новый патч только для версии новее последней проверенной', () => {
    expect(classifyUnsupportedIntegrationVersion('codex', '26.819.1')).toEqual({
      attention: 'new_patch',
      latestExactVersion: '26.818.61809',
    });
    expect(classifyUnsupportedIntegrationVersion('claude', '2.1.246')).toEqual({
      attention: 'new_patch',
      latestExactVersion: '2.1.245',
    });
  });
});

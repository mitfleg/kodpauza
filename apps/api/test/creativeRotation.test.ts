import { describe, expect, it } from 'vitest';
import { selectCampaignCreative } from '../src/services/creativeRotation.js';

const createdAt = new Date('2026-07-19T00:00:00Z');
const creative = (id: string, impressionsServed: number, clicks = 0, enabled = true) => ({
  id,
  enabled,
  impressionsServed,
  clicks,
  createdAt,
});

describe('creative rotation', () => {
  it('сначала равномерно исследует до трех вариантов и не повторяет последний', () => {
    const result = selectCampaignCreative(
      [creative('a', 5), creative('b', 4), creative('c', 4)],
      [{ creativeId: 'b' }],
    );
    expect(result?.id).toBe('c');
  });

  it('после исследования отдаёт больше трафика варианту с лучшим сглаженным CTR', () => {
    const result = selectCampaignCreative(
      [creative('a', 100, 12), creative('b', 100, 2), creative('c', 100, 4)],
      [{ creativeId: 'c' }, { creativeId: 'b' }],
    );
    expect(result?.id).toBe('a');
  });

  it('игнорирует выключенные варианты и поддерживает единственный', () => {
    expect(selectCampaignCreative([creative('a', 50, 5, false), creative('b', 50, 5)], [])?.id).toBe('b');
  });
});

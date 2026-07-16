import { describe, expect, it } from 'vitest';
import { selectRotatedCampaign } from '../src/services/adRotation.js';

const createdAt = new Date('2026-07-16T00:00:00.000Z');

function campaign(id: string, billableCpmKopecks: number) {
  return { id, billableCpmKopecks, createdAt };
}

describe('ad rotation', () => {
  it('не повторяет кампанию в двух следующих окнах', () => {
    const campaigns = [campaign('premium-1', 45_000), campaign('premium-2', 45_000), campaign('standard-1', 30_000)];
    const selected = selectRotatedCampaign(campaigns, [
      { campaignId: 'premium-1' },
      { campaignId: 'premium-2' },
    ]);

    expect(selected?.id).toBe('standard-1');
  });

  it('чередует две кампании и повторяет единственную доступную', () => {
    const first = campaign('first', 30_000);
    const second = campaign('second', 30_000);

    expect(selectRotatedCampaign([first, second], [{ campaignId: 'first' }])?.id).toBe('second');
    expect(selectRotatedCampaign([first], [{ campaignId: 'first' }])?.id).toBe('first');
  });

  it('дает дорогой кампании больший вес без вытеснения остальных', () => {
    const campaigns = [
      campaign('premium-1', 45_000),
      campaign('premium-2', 45_000),
      campaign('premium-3', 45_000),
      campaign('standard-1', 30_000),
      campaign('standard-2', 30_000),
      campaign('standard-3', 30_000),
      campaign('standard-4', 30_000),
      campaign('standard-5', 30_000),
      campaign('standard-6', 30_000),
    ];
    const history: Array<{ campaignId: string }> = [];
    const selectedIds: string[] = [];

    for (let index = 0; index < 120; index += 1) {
      const selected = selectRotatedCampaign(campaigns, history);
      expect(selected).toBeDefined();
      selectedIds.push(selected!.id);
      history.unshift({ campaignId: selected!.id });
    }

    for (let index = 2; index < selectedIds.length; index += 1) {
      expect(selectedIds[index]).not.toBe(selectedIds[index - 1]);
      expect(selectedIds[index]).not.toBe(selectedIds[index - 2]);
    }

    const count = (id: string) => selectedIds.filter((selectedId) => selectedId === id).length;
    const premiumAverage = (count('premium-1') + count('premium-2') + count('premium-3')) / 3;
    const standardAverage =
      (count('standard-1') +
        count('standard-2') +
        count('standard-3') +
        count('standard-4') +
        count('standard-5') +
        count('standard-6')) /
      6;
    expect(premiumAverage).toBeGreaterThan(standardAverage);
    expect(new Set(selectedIds)).toEqual(new Set(campaigns.map((item) => item.id)));
  });
});

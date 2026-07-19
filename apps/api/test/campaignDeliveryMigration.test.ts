import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('campaign delivery migration', () => {
  it('переносит расход поверхности только из чистых оплаченных показов', async () => {
    const migration = await readFile(
      new URL(
        '../../../prisma/migrations/20260719120000_campaign_delivery_controls/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );

    const surfaceBackfill = migration.slice(
      migration.indexOf('INSERT INTO "CampaignSurface"'),
      migration.indexOf('INSERT INTO "CampaignCreative"'),
    );
    expect(surfaceBackfill).toContain('paid."adServeId" = a."id"');
    expect(surfaceBackfill).toContain('paid."type" = \'impression\'');
    expect(surfaceBackfill).toContain('paid."fraudStatus" = \'clean\'');
  });
});

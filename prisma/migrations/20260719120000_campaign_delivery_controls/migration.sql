CREATE TYPE "CampaignDeliveryMode" AS ENUM ('asap', 'even');

ALTER TABLE "DeveloperProfile"
  ADD COLUMN "rewardRemainderUnits" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Campaign"
  ADD COLUMN "billingRemainderMilliKopecks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryMode" "CampaignDeliveryMode" NOT NULL DEFAULT 'asap',
  ADD COLUMN "dailyBudgetKopecks" INTEGER,
  ADD COLUMN "frequencyCapPerDay" INTEGER,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "autoPausedAt" TIMESTAMP(3),
  ADD COLUMN "pauseReason" TEXT;

CREATE TABLE "CampaignSurface" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "surface" "Surface" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "cpmKopecks" INTEGER NOT NULL,
  "billableCpmKopecks" INTEGER NOT NULL,
  "spentKopecks" INTEGER NOT NULL DEFAULT 0,
  "impressionsServed" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignSurface_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignCreative" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "impressionsServed" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignDeliveryDay" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "day" TIMESTAMP(3) NOT NULL,
  "spentKopecks" INTEGER NOT NULL DEFAULT 0,
  "impressionsServed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignDeliveryDay_pkey" PRIMARY KEY ("id")
);

-- Stop before copying legacy values if an out-of-band database write broke the
-- accounting invariant. This keeps the migration atomic and gives the operator
-- a precise reason instead of failing later while adding a generic constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Campaign"
    WHERE "cpmKopecks" < 2000 OR "billableCpmKopecks" < "cpmKopecks"
  ) THEN
    RAISE EXCEPTION 'Campaign CPM values must be repaired before delivery controls migration';
  END IF;
END $$;

INSERT INTO "CampaignSurface" (
  "id", "campaignId", "surface", "cpmKopecks", "billableCpmKopecks", "spentKopecks", "impressionsServed", "clicks"
)
SELECT
  'legacy_' || md5(c."id" || s."surface"::text),
  c."id",
  s."surface",
  c."cpmKopecks",
  c."billableCpmKopecks",
  COALESCE((
    SELECT SUM(a."costKopecks")::INTEGER
    FROM "AdServe" a
    WHERE a."campaignId" = c."id"
      AND a."surface" = s."surface"
      AND a."impressionRecordedAt" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "AdEvent" paid
        WHERE paid."adServeId" = a."id"
          AND paid."type" = 'impression'
          AND paid."fraudStatus" = 'clean'
      )
  ), 0),
  COALESCE((
    SELECT COUNT(*)::INTEGER
    FROM "AdEvent" e
    WHERE e."campaignId" = c."id"
      AND e."surface" = s."surface"
      AND e."type" = 'impression'
      AND e."fraudStatus" = 'clean'
  ), 0),
  COALESCE((
    SELECT COUNT(*)::INTEGER
    FROM "AdEvent" e
    WHERE e."campaignId" = c."id"
      AND e."surface" = s."surface"
      AND e."type" = 'click'
      AND e."fraudStatus" = 'clean'
  ), 0)
FROM "Campaign" c
CROSS JOIN (VALUES ('codex_vscode'::"Surface"), ('claude_code_vscode'::"Surface")) AS s("surface");

INSERT INTO "CampaignCreative" (
  "id", "campaignId", "label", "text", "url", "impressionsServed", "clicks"
)
SELECT
  'legacy_' || md5(c."id"),
  c."id",
  'Основной',
  c."text",
  c."url",
  c."impressionsServed",
  c."clicks"
FROM "Campaign" c;

ALTER TABLE "AdServe" ADD COLUMN "creativeId" TEXT;
UPDATE "AdServe" s
SET "creativeId" = 'legacy_' || md5(s."campaignId");
ALTER TABLE "AdServe" ALTER COLUMN "creativeId" SET NOT NULL;

ALTER TABLE "AdEvent" ADD COLUMN "creativeId" TEXT;
UPDATE "AdEvent" e
SET "creativeId" = 'legacy_' || md5(e."campaignId");
ALTER TABLE "AdEvent" ALTER COLUMN "creativeId" SET NOT NULL;

-- A CPM impression is allowed to be worth less than one kopeck. The exact
-- accounting carry is stored separately and can therefore produce a zero
-- whole-kopeck amount until the fractional remainder accumulates.
ALTER TABLE "AdServe" DROP CONSTRAINT "AdServe_positive_amounts_check";
ALTER TABLE "AdServe" ADD CONSTRAINT "AdServe_nonnegative_amounts_check"
  CHECK (
    "cpmKopecks" >= 2000
    AND "billableCpmKopecks" >= "cpmKopecks"
    AND "costKopecks" >= 0
    AND "rewardKopecks" >= 0
  );

CREATE UNIQUE INDEX "CampaignSurface_campaignId_surface_key" ON "CampaignSurface"("campaignId", "surface");
CREATE INDEX "CampaignSurface_surface_enabled_billableCpmKopecks_idx" ON "CampaignSurface"("surface", "enabled", "billableCpmKopecks");
CREATE INDEX "CampaignCreative_campaignId_enabled_createdAt_idx" ON "CampaignCreative"("campaignId", "enabled", "createdAt");
CREATE UNIQUE INDEX "CampaignDeliveryDay_campaignId_day_key" ON "CampaignDeliveryDay"("campaignId", "day");
CREATE INDEX "CampaignDeliveryDay_day_idx" ON "CampaignDeliveryDay"("day");
CREATE INDEX "AdServe_creativeId_expiresAt_idx" ON "AdServe"("creativeId", "expiresAt");
CREATE INDEX "AdEvent_creativeId_type_createdAt_idx" ON "AdEvent"("creativeId", "type", "createdAt");

ALTER TABLE "CampaignSurface" ADD CONSTRAINT "CampaignSurface_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignDeliveryDay" ADD CONSTRAINT "CampaignDeliveryDay_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdServe" ADD CONSTRAINT "AdServe_creativeId_fkey"
  FOREIGN KEY ("creativeId") REFERENCES "CampaignCreative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_creativeId_fkey"
  FOREIGN KEY ("creativeId") REFERENCES "CampaignCreative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeveloperProfile" ADD CONSTRAINT "DeveloperProfile_reward_remainder_check"
  CHECK ("rewardRemainderUnits" >= 0 AND "rewardRemainderUnits" < 10000000);
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_delivery_controls_check" CHECK (
  "billingRemainderMilliKopecks" >= 0
  AND "billingRemainderMilliKopecks" < 1000
  AND ("dailyBudgetKopecks" IS NULL OR "dailyBudgetKopecks" > 0)
  AND ("frequencyCapPerDay" IS NULL OR "frequencyCapPerDay" > 0)
  AND ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt")
);
ALTER TABLE "CampaignSurface" ADD CONSTRAINT "CampaignSurface_amounts_check" CHECK (
  "cpmKopecks" >= 2000
  AND "billableCpmKopecks" >= "cpmKopecks"
  AND "spentKopecks" >= 0
  AND "impressionsServed" >= 0
  AND "clicks" >= 0
);
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_counters_check" CHECK (
  "impressionsServed" >= 0 AND "clicks" >= 0
);
ALTER TABLE "CampaignDeliveryDay" ADD CONSTRAINT "CampaignDeliveryDay_counters_check" CHECK (
  "spentKopecks" >= 0 AND "impressionsServed" >= 0
);

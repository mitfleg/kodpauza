ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'advertiser_charge';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'advertiser_credit';

ALTER TABLE "DeveloperProfile" ADD COLUMN "eventSecret" TEXT;
UPDATE "DeveloperProfile"
SET "eventSecret" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "eventSecret" IS NULL;
ALTER TABLE "DeveloperProfile" ALTER COLUMN "eventSecret" SET NOT NULL;
CREATE UNIQUE INDEX "DeveloperProfile_eventSecret_key" ON "DeveloperProfile"("eventSecret");

CREATE TABLE "AdServe" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "surface" "Surface" NOT NULL,
    "cpmKopecks" INTEGER NOT NULL,
    "costKopecks" INTEGER NOT NULL,
    "rewardKopecks" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "impressionRecordedAt" TIMESTAMP(3),
    "clickRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdServe_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdServe_positive_amounts_check" CHECK ("cpmKopecks" >= 2000 AND "costKopecks" > 0 AND "rewardKopecks" > 0)
);

ALTER TABLE "AdEvent" ADD COLUMN "adServeId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "AdServe_adId_key" ON "AdServe"("adId");
CREATE INDEX "AdServe_userId_createdAt_idx" ON "AdServe"("userId", "createdAt");
CREATE INDEX "AdServe_campaignId_expiresAt_idx" ON "AdServe"("campaignId", "expiresAt");
CREATE INDEX "AdEvent_adServeId_type_idx" ON "AdEvent"("adServeId", "type");
CREATE INDEX "LedgerEntry_eventId_idx" ON "LedgerEntry"("eventId");
CREATE INDEX "Campaign_advertiserId_createdAt_idx" ON "Campaign"("advertiserId", "createdAt");
CREATE UNIQUE INDEX "User_email_lower_key" ON "User"(lower("email"));

ALTER TABLE "AdServe" ADD CONSTRAINT "AdServe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdServe" ADD CONSTRAINT "AdServe_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_adServeId_fkey" FOREIGN KEY ("adServeId") REFERENCES "AdServe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AdEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeveloperProfile" ADD CONSTRAINT "DeveloperProfile_balance_check" CHECK ("balanceKopecks" >= 0 AND "totalImpressions" >= 0 AND "totalClicks" >= 0);
ALTER TABLE "AdvertiserProfile" ADD CONSTRAINT "AdvertiserProfile_balance_check" CHECK ("balanceKopecks" >= 0);
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_accounting_check" CHECK (
  "cpmKopecks" >= 2000
  AND "budgetKopecks" >= 100
  AND "spentKopecks" >= 0
  AND "spentKopecks" <= "budgetKopecks"
  AND "impressionsServed" >= 0
  AND "clicks" >= 0
  AND ("impressionsLimit" IS NULL OR ("impressionsLimit" > 0 AND "impressionsServed" <= "impressionsLimit"))
);

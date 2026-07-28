-- CreateEnum
CREATE TYPE "OrdRegistrationStatus" AS ENUM ('unregistered', 'pending', 'registered', 'rejected');

-- CreateEnum
CREATE TYPE "OrdReportStatus" AS ENUM ('draft', 'submitted', 'accepted', 'rejected');

-- AlterTable
ALTER TABLE "AdvertiserProfile"
ADD COLUMN "publicName" TEXT,
ADD COLUMN "advertiserInfoUrl" TEXT,
ADD COLUMN "ordOrganizationId" TEXT;

UPDATE "AdvertiserProfile"
SET "publicName" = "companyName"
WHERE "publicName" IS NULL;

ALTER TABLE "AdvertiserProfile"
ALTER COLUMN "publicName" SET NOT NULL;

-- AlterTable
ALTER TABLE "Campaign"
ADD COLUMN "selfPromotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ordPlatformId" TEXT;

-- AlterTable
ALTER TABLE "CampaignCreative"
ADD COLUMN "erid" TEXT,
ADD COLUMN "ordCreativeId" TEXT,
ADD COLUMN "ordStatus" "OrdRegistrationStatus" NOT NULL DEFAULT 'unregistered',
ADD COLUMN "ordLastError" TEXT,
ADD COLUMN "ordRegisteredAt" TIMESTAMP(3);

-- Preserve every already issued campaign token on its existing creatives.
UPDATE "CampaignCreative" AS creative
SET "erid" = campaign."erid"
FROM "Campaign" AS campaign
WHERE creative."campaignId" = campaign."id"
  AND creative."erid" IS NULL
  AND campaign."erid" IS NOT NULL;

-- CreateTable
CREATE TABLE "OrdStatisticReport" (
  "id" TEXT NOT NULL,
  "creativeId" TEXT NOT NULL,
  "platformId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "impressions" INTEGER NOT NULL,
  "clicks" INTEGER NOT NULL,
  "amountKopecks" INTEGER NOT NULL DEFAULT 0,
  "status" "OrdReportStatus" NOT NULL DEFAULT 'draft',
  "provider" TEXT NOT NULL DEFAULT 'yandex',
  "externalRequestId" TEXT,
  "error" TEXT,
  "submittedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrdStatisticReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdStatisticReport_creativeId_platformId_periodStart_periodEnd_key"
ON "OrdStatisticReport"("creativeId", "platformId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "OrdStatisticReport_status_periodStart_idx"
ON "OrdStatisticReport"("status", "periodStart");

-- AddForeignKey
ALTER TABLE "OrdStatisticReport"
ADD CONSTRAINT "OrdStatisticReport_creativeId_fkey"
FOREIGN KEY ("creativeId") REFERENCES "CampaignCreative"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

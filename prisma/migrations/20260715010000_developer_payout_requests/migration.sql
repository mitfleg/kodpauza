CREATE TYPE "DeveloperPayoutStatus" AS ENUM ('requested', 'paid', 'rejected', 'canceled');

ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'payout_reserved';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'payout_succeeded';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'payout_released';

ALTER TABLE "DeveloperProfile"
  ADD COLUMN "reservedKopecks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paidKopecks" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "DeveloperPayout" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "idempotenceKey" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" "DeveloperPayoutStatus" NOT NULL DEFAULT 'requested',
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "externalReference" TEXT,
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperPayout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeveloperPayout_amount_check" CHECK ("amountKopecks" > 0),
    CONSTRAINT "DeveloperPayout_currency_check" CHECK ("currency" = 'RUB')
);

ALTER TABLE "LedgerEntry" ADD COLUMN "payoutId" TEXT;

CREATE UNIQUE INDEX "DeveloperPayout_idempotenceKey_key" ON "DeveloperPayout"("idempotenceKey");
CREATE UNIQUE INDEX "DeveloperPayout_developerId_clientRequestId_key" ON "DeveloperPayout"("developerId", "clientRequestId");
CREATE UNIQUE INDEX "DeveloperPayout_one_requested_per_developer_key" ON "DeveloperPayout"("developerId") WHERE "status" = 'requested';
CREATE INDEX "DeveloperPayout_developerId_createdAt_idx" ON "DeveloperPayout"("developerId", "createdAt");
CREATE INDEX "DeveloperPayout_status_createdAt_idx" ON "DeveloperPayout"("status", "createdAt");
CREATE INDEX "LedgerEntry_payoutId_idx" ON "LedgerEntry"("payoutId");

ALTER TABLE "DeveloperPayout"
  ADD CONSTRAINT "DeveloperPayout_developerId_fkey"
  FOREIGN KEY ("developerId") REFERENCES "DeveloperProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "DeveloperPayout"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeveloperProfile" DROP CONSTRAINT IF EXISTS "DeveloperProfile_balance_check";
ALTER TABLE "DeveloperProfile" ADD CONSTRAINT "DeveloperProfile_balance_check" CHECK (
  "balanceKopecks" >= 0
  AND "reservedKopecks" >= 0
  AND "paidKopecks" >= 0
  AND "totalImpressions" >= 0
  AND "totalClicks" >= 0
);

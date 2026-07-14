CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'canceled', 'failed');

CREATE TABLE "AdvertiserPayment" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'yookassa',
    "providerPaymentId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "idempotenceKey" TEXT NOT NULL,
    "amountKopecks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "confirmationUrl" TEXT,
    "providerTest" BOOLEAN,
    "providerCreatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertiserPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LedgerEntry" ADD COLUMN "paymentId" TEXT;

CREATE UNIQUE INDEX "AdvertiserPayment_providerPaymentId_key" ON "AdvertiserPayment"("providerPaymentId");
CREATE UNIQUE INDEX "AdvertiserPayment_idempotenceKey_key" ON "AdvertiserPayment"("idempotenceKey");
CREATE UNIQUE INDEX "AdvertiserPayment_advertiserId_clientRequestId_key" ON "AdvertiserPayment"("advertiserId", "clientRequestId");
CREATE INDEX "AdvertiserPayment_advertiserId_createdAt_idx" ON "AdvertiserPayment"("advertiserId", "createdAt");
CREATE INDEX "AdvertiserPayment_status_createdAt_idx" ON "AdvertiserPayment"("status", "createdAt");
CREATE UNIQUE INDEX "LedgerEntry_paymentId_key" ON "LedgerEntry"("paymentId");

ALTER TABLE "AdvertiserPayment"
  ADD CONSTRAINT "AdvertiserPayment_advertiserId_fkey"
  FOREIGN KEY ("advertiserId") REFERENCES "AdvertiserProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "AdvertiserPayment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

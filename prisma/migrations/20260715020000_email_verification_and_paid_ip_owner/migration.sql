ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationCodeHash" TEXT,
ADD COLUMN "emailVerificationCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationCodeSentAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- Existing accounts predate mandatory email verification. Preserve their access while
-- ensuring every account created after this migration starts inactive.
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;

CREATE INDEX "User_emailVerifiedAt_idx" ON "User"("emailVerifiedAt");

CREATE INDEX "AdEvent_paid_ip_owner_idx"
ON "AdEvent" ("ipHash", "createdAt", "id")
WHERE "ipHash" IS NOT NULL
  AND "type" = 'impression'
  AND "fraudStatus" = 'clean'
  AND "rewardKopecks" > 0;

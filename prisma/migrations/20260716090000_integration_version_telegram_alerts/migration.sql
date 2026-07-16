ALTER TABLE "CodexVersionReport"
ADD COLUMN "alertAttemptedAt" TIMESTAMP(3),
ADD COLUMN "alertSentAt" TIMESTAMP(3),
ADD COLUMN "alertError" TEXT;

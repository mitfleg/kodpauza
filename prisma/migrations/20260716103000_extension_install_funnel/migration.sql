ALTER TABLE "ExtensionInstall"
ADD COLUMN "integrationsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "codexDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "claudeDetected" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ExtensionInstall_lastSeenAt_idx" ON "ExtensionInstall"("lastSeenAt");

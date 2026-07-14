CREATE TABLE "CodexVersionReport" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "supported" BOOLEAN NOT NULL,
    "clientVersion" TEXT NOT NULL,
    "editorName" TEXT NOT NULL,
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    CONSTRAINT "CodexVersionReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodexVersionReport_version_key" ON "CodexVersionReport"("version");
CREATE INDEX "CodexVersionReport_acknowledgedAt_lastSeenAt_idx" ON "CodexVersionReport"("acknowledgedAt", "lastSeenAt");

ALTER TABLE "CodexVersionReport"
ADD COLUMN "tool" TEXT NOT NULL DEFAULT 'codex';

DROP INDEX "CodexVersionReport_version_key";

CREATE UNIQUE INDEX "CodexVersionReport_tool_version_key"
ON "CodexVersionReport"("tool", "version");

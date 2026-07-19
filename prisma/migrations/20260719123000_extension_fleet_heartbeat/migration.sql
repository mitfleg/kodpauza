ALTER TABLE "ExtensionInstall"
  ADD COLUMN "heartbeatSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "editorName" TEXT,
  ADD COLUMN "codexVersion" TEXT,
  ADD COLUMN "claudeVersion" TEXT,
  ADD COLUMN "codexPatchStatus" TEXT,
  ADD COLUMN "claudePatchStatus" TEXT,
  ADD COLUMN "codexPatchErrorCategory" TEXT,
  ADD COLUMN "claudePatchErrorCategory" TEXT;

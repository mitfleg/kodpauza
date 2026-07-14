ALTER TABLE "CodexVersionReport"
ADD COLUMN "compatibilityMode" TEXT NOT NULL DEFAULT 'unsupported';

UPDATE "CodexVersionReport"
SET "compatibilityMode" = CASE
  WHEN "supported" = TRUE THEN 'exact'
  ELSE 'unsupported'
END;

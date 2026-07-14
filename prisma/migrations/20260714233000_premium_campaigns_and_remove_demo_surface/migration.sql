CREATE TYPE "CampaignFormat" AS ENUM ('standard', 'premium');

ALTER TABLE "Campaign"
ADD COLUMN "format" "CampaignFormat" NOT NULL DEFAULT 'standard',
ADD COLUMN "billableCpmKopecks" INTEGER;

UPDATE "Campaign"
SET "billableCpmKopecks" = "cpmKopecks";

ALTER TABLE "Campaign"
ALTER COLUMN "billableCpmKopecks" SET NOT NULL;

ALTER TABLE "AdServe"
ADD COLUMN "format" "CampaignFormat" NOT NULL DEFAULT 'standard',
ADD COLUMN "billableCpmKopecks" INTEGER;

UPDATE "AdServe"
SET "billableCpmKopecks" = "cpmKopecks";

ALTER TABLE "AdServe"
ALTER COLUMN "billableCpmKopecks" SET NOT NULL,
ALTER COLUMN "format" DROP DEFAULT;

DROP INDEX "Campaign_status_cpmKopecks_idx";
CREATE INDEX "Campaign_status_billableCpmKopecks_idx"
ON "Campaign"("status", "billableCpmKopecks");

UPDATE "AdServe"
SET "surface" = 'vscode_status_bar'
WHERE "surface" = 'demo_adapter';

UPDATE "AdEvent"
SET "surface" = 'vscode_status_bar'
WHERE "surface" = 'demo_adapter';

ALTER TABLE "AdServe" ALTER COLUMN "surface" TYPE TEXT USING "surface"::TEXT;
ALTER TABLE "AdEvent" ALTER COLUMN "surface" TYPE TEXT USING "surface"::TEXT;
DROP TYPE "Surface";
CREATE TYPE "Surface" AS ENUM ('vscode_status_bar', 'claude_code_vscode', 'codex_vscode');
ALTER TABLE "AdServe" ALTER COLUMN "surface" TYPE "Surface" USING "surface"::"Surface";
ALTER TABLE "AdEvent" ALTER COLUMN "surface" TYPE "Surface" USING "surface"::"Surface";

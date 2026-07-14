-- Campaign delivery is global. The requested surface belongs to each serve and
-- event, while advertisers no longer have to duplicate campaigns per adapter.
DROP INDEX "Campaign_surface_status_cpmKopecks_idx";
ALTER TABLE "Campaign" DROP COLUMN "surface";
CREATE INDEX "Campaign_status_cpmKopecks_idx" ON "Campaign"("status", "cpmKopecks");

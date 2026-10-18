-- Walls and fog prepared on a library map (ADR 0037).
-- AlterTable
ALTER TABLE "library_assets" ADD COLUMN "board" JSONB;

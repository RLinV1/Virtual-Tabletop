-- Shipped maps are seeded per map, so a new built-in map reaches existing libraries once (ADR 0036).
-- AlterTable
ALTER TABLE "gm_identities" ADD COLUMN "shipped_maps_seeded" TEXT[] NOT NULL DEFAULT '{}';

-- Owners seeded before this change already received the three original maps.
UPDATE "gm_identities"
SET "shipped_maps_seeded" = ARRAY['broken-span', 'hollowfrost-keep', 'temple-green-sun']
WHERE "shipped_maps_seeded_at" IS NOT NULL;

-- Shipped maps seeded into each owner's library once (ADR 0036).
-- AlterTable
ALTER TABLE "gm_identities" ADD COLUMN "shipped_maps_seeded_at" TIMESTAMPTZ(6);

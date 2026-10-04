-- Creatures remember their disc colour and starting conditions (KAN-70, ADR 0020).
-- Existing rows keep working: a null colour reads as the default token colour.
ALTER TABLE "library_creatures" ADD COLUMN "color" TEXT;
ALTER TABLE "library_creatures" ADD COLUMN "conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

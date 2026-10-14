-- Temporary rooms for editing encounter templates (ADR 0033).
-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "temporary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "edits_encounter_id" UUID;

-- CreateIndex
CREATE INDEX "rooms_temporary_created_at_idx" ON "rooms"("temporary", "created_at");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_edits_encounter_id_fkey" FOREIGN KEY ("edits_encounter_id") REFERENCES "encounter_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

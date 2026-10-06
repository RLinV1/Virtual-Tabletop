-- CreateTable
CREATE TABLE "encounter_templates" (
    "id" UUID NOT NULL,
    "owner_gm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "map_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "encounter_templates_owner_gm_id_idx" ON "encounter_templates"("owner_gm_id");

-- CreateIndex
CREATE INDEX "encounter_templates_map_asset_id_idx" ON "encounter_templates"("map_asset_id");

-- AddForeignKey
ALTER TABLE "encounter_templates" ADD CONSTRAINT "encounter_templates_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounter_templates" ADD CONSTRAINT "encounter_templates_map_asset_id_fkey" FOREIGN KEY ("map_asset_id") REFERENCES "library_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "library_creatures" (
    "id" UUID NOT NULL,
    "owner_gm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "max_hp" INTEGER,
    "ac" INTEGER,
    "image_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_creatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_creatures_owner_gm_id_idx" ON "library_creatures"("owner_gm_id");

-- CreateIndex
CREATE INDEX "library_creatures_image_asset_id_idx" ON "library_creatures"("image_asset_id");

-- AddForeignKey
ALTER TABLE "library_creatures" ADD CONSTRAINT "library_creatures_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_creatures" ADD CONSTRAINT "library_creatures_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "library_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

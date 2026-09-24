-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "name" TEXT,
ADD COLUMN     "owner_gm_id" UUID;

-- CreateTable
CREATE TABLE "gm_identities" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gm_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_assets" (
    "id" UUID NOT NULL,
    "owner_gm_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "grid" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_refs" (
    "asset_id" TEXT NOT NULL,
    "room_id" UUID NOT NULL,

    CONSTRAINT "asset_refs_pkey" PRIMARY KEY ("asset_id","room_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gm_identities_token_hash_key" ON "gm_identities"("token_hash");

-- CreateIndex
CREATE INDEX "library_assets_owner_gm_id_kind_idx" ON "library_assets"("owner_gm_id", "kind");

-- CreateIndex
CREATE INDEX "asset_refs_room_id_idx" ON "asset_refs"("room_id");

-- CreateIndex
CREATE INDEX "rooms_owner_gm_id_idx" ON "rooms"("owner_gm_id");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_refs" ADD CONSTRAINT "asset_refs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Animations a GM keeps in the library (ADR 0038). `def` is the validated AnimationDef.
-- CreateTable
CREATE TABLE "library_animations" (
    "id" UUID NOT NULL,
    "owner_gm_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "def" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_animations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_animations_owner_gm_id_idx" ON "library_animations"("owner_gm_id");

-- AddForeignKey
ALTER TABLE "library_animations" ADD CONSTRAINT "library_animations_owner_gm_id_fkey" FOREIGN KEY ("owner_gm_id") REFERENCES "gm_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

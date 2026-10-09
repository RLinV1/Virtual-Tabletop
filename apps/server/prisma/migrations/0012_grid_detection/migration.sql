ALTER TABLE "library_assets"
  ADD COLUMN "detection_status" TEXT,
  ADD COLUMN "detection_attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "detection_result" JSONB,
  ADD COLUMN "detection_updated_at" TIMESTAMPTZ(6);

ALTER TABLE "room_uploads"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'token',
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "detection_status" TEXT,
  ADD COLUMN "detection_attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "detection_result" JSONB,
  ADD COLUMN "detection_updated_at" TIMESTAMPTZ(6);

CREATE INDEX "library_assets_detection_status_idx" ON "library_assets"("detection_status");
CREATE INDEX "room_uploads_detection_status_idx" ON "room_uploads"("detection_status");

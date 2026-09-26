-- CreateTable
CREATE TABLE "room_uploads" (
    "room_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,

    CONSTRAINT "room_uploads_pkey" PRIMARY KEY ("room_id","object_key")
);

-- CreateIndex
CREATE INDEX "room_uploads_room_id_idx" ON "room_uploads"("room_id");

-- AddForeignKey
ALTER TABLE "room_uploads" ADD CONSTRAINT "room_uploads_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

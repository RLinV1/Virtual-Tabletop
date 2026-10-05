-- Older creatures keep starting at max_hp; an explicit zero remains zero.
ALTER TABLE "library_creatures" ADD COLUMN "hp" INTEGER;

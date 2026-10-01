-- Groups each command's events so undo reverses a command as one unit (ADR 0013).
-- Nullable: events written before undo existed have no command id and are grouped by seq.
ALTER TABLE "events" ADD COLUMN "command_id" UUID;

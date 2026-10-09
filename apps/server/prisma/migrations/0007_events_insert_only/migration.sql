-- The event log is append-only (FR-REC-03, KAN-42, docs/adr/0001-event-model.md invariant 5).
-- Enforced here, not only in application code: any UPDATE or TRUNCATE on "events" fails, and a
-- DELETE fails unless the same transaction is deleting that event's whole room (ADR 0009). Room
-- deletion opts in with `SELECT set_config('vtt.room_delete', <room id>, true)`, which lasts only
-- until the transaction ends. The opt-in alone is not trusted: a deferred check at commit
-- refuses any deleted event whose room still exists, and the room's foreign key already refuses
-- removing a room that still has events, so only a whole log can go, together with its room.
-- A migration that must rewrite events drops and recreates these triggers inside itself, so the
-- rewrite is deliberate and visible in review.

CREATE FUNCTION events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND OLD.room_id::text = current_setting('vtt.room_delete', true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'events is append-only (FR-REC-03): % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER events_no_update
  BEFORE UPDATE ON "events"
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TRIGGER events_no_delete
  BEFORE DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON "events"
  FOR EACH STATEMENT EXECUTE FUNCTION events_append_only();

-- At commit: an event may only have been deleted if its room was deleted in the same transaction.
CREATE FUNCTION events_delete_requires_room_gone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rooms" WHERE id = OLD.room_id) THEN
    RAISE EXCEPTION 'events is append-only (FR-REC-03): events may be deleted only with their room'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER events_delete_with_room
  AFTER DELETE ON "events"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION events_delete_requires_room_gone();

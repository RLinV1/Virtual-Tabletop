-- The event log is append-only (FR-REC-03, KAN-42, docs/adr/0001-event-model.md invariant 5).
-- Enforced here, not only in application code: any UPDATE or TRUNCATE on "events" fails, and a
-- DELETE fails unless the same transaction is deleting that event's whole room (ADR 0009). Room
-- deletion opts in with `SELECT set_config('vtt.room_delete', <room id>, true)`, which lasts only
-- until the transaction ends. A migration that must rewrite events drops and recreates these
-- triggers inside itself, so the rewrite is deliberate and visible in review.

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

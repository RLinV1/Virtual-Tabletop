-- Target Postgres schema for the event store (see docs/adr/0001-event-model.md).
-- Not used yet: the server currently runs on MemoryRoomStore.

CREATE TABLE rooms (
  id           uuid PRIMARY KEY,
  invite_code  text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Append-only. Never UPDATE or DELETE rows.
CREATE TABLE events (
  room_id    uuid NOT NULL REFERENCES rooms(id),
  seq        integer NOT NULL CHECK (seq > 0),
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  actor_id   uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, seq)          -- enforces per-room ordering (FR-SYNC-04)
);

CREATE TABLE credentials (
  token_hash     text PRIMARY KEY,    -- sha256 of the browser's opaque token
  room_id        uuid NOT NULL REFERENCES rooms(id),
  participant_id uuid NOT NULL,
  revoked_at     timestamptz          -- FR-GM-20
);

-- Periodic snapshots for fast room load; state at `seq`.
CREATE TABLE snapshots (
  room_id    uuid NOT NULL REFERENCES rooms(id),
  seq        integer NOT NULL,
  state      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, seq)
);

-- Named checkpoints (FR-REC).
CREATE TABLE checkpoints (
  id         uuid PRIMARY KEY,
  room_id    uuid NOT NULL REFERENCES rooms(id),
  name       text NOT NULL,
  seq        integer NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

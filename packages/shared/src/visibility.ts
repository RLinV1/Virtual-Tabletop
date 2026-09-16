import type { CommittedEvent } from "./events";
import type { Participant, RoomState } from "./state";

/**
 * Player-safe state filtering (FR-GM-23).
 *
 * EVERY payload that carries room data to a client must go through one of these
 * functions: snapshots, live events, REST responses, reconnect payloads.
 * When adding a new kind of hidden data (fog, GM-only rolls, ...), extend BOTH functions
 * and add a test in test/visibility.test.ts.
 */
export function filterStateForViewer(state: RoomState, viewer: Participant): RoomState {
  if (viewer.role === "gm") return state;
  const tokens = Object.fromEntries(
    Object.entries(state.tokens).filter(([, t]) => !t.hidden),
  );
  return { ...state, tokens };
}

export type FilteredEvent =
  /** Deliver as-is. */
  | { kind: "event"; committed: CommittedEvent }
  /** Viewer may not see this; deliver only the seq so their ordering stays gap-free. */
  | { kind: "redacted"; seq: number }
  /** The viewer's visible world changed shape; send a fresh filtered snapshot instead. */
  | { kind: "resync" };

export function filterEventForViewer(
  committed: CommittedEvent,
  before: RoomState,
  viewer: Participant,
): FilteredEvent {
  if (viewer.role === "gm") return { kind: "event", committed };

  const e = committed.event;
  const redacted: FilteredEvent = { kind: "redacted", seq: committed.seq };
  const pass: FilteredEvent = { kind: "event", committed };
  const hiddenBefore = (tokenId: string) => before.tokens[tokenId]?.hidden ?? true;

  switch (e.type) {
    case "TokenCreated":
      return e.token.hidden ? redacted : pass;
    case "TokenDeleted":
      return e.token.hidden ? redacted : pass;
    case "TokenMoved":
    case "TokenOwnersSet":
      return hiddenBefore(e.tokenId) ? redacted : pass;
    case "TokenHiddenSet":
      // A reveal must deliver the whole token; a hide must remove it. A snapshot does both.
      return { kind: "resync" };
    case "RoomCreated":
    case "ParticipantJoined":
    case "ParticipantRenamed":
    case "MapSet":
    case "GridSet":
      return pass;
  }
}

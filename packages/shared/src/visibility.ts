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
  // GM-only rolls never reach a player, not even as a redacted placeholder (FR-GM-22).
  const rolls = state.rolls.filter((r) => r.visibility === "public");
  // A hidden token must not be inferable from a gap in the turn order (FR-GM-23).
  const initiative = state.initiative
    ? { ...state.initiative, order: state.initiative.order.filter((id) => tokens[id]) }
    : null;
  // GM-only area templates are withheld entirely, like hidden tokens (ADR 0007).
  const templates = Object.fromEntries(
    Object.entries(state.templates).filter(([, t]) => !t.gmOnly),
  );
  return { ...state, tokens, rolls, initiative, templates };
}

export type FilteredEvent =
  /** Deliver as-is. */
  | { kind: "event"; committed: CommittedEvent }
  /** Viewer may not see this; deliver only the seq so their ordering stays gap-free. */
  | { kind: "redacted"; seq: number }
  /** The viewer's visible world changed shape; send a fresh filtered snapshot instead. */
  | { kind: "resync" };

/** Decides what one viewer receives for a committed event: as-is, a redacted seq, or a resync. */
export function filterEventForViewer(
  committed: CommittedEvent,
  before: RoomState,
  viewer: Participant,
): FilteredEvent {
  if (viewer.role === "gm") return { kind: "event", committed };

  const e = committed.event;
  const redacted: FilteredEvent = { kind: "redacted", seq: committed.seq };
  const pass: FilteredEvent = { kind: "event", committed };
  /** Whether the viewer could not see this token before the event; unknown tokens count as hidden. */
  const hiddenBefore = (tokenId: string) => before.tokens[tokenId]?.hidden ?? true;

  switch (e.type) {
    case "TokenCreated":
      return e.token.hidden ? redacted : pass;
    case "TokenDeleted":
      return e.token.hidden ? redacted : pass;
    case "TokenMoved":
    case "TokenAppearanceSet":
    case "TokenOwnersSet":
    case "TokenStatsSet":
    case "TokenImageSet":
    case "TokenConditionsSet":
      return hiddenBefore(e.tokenId) ? redacted : pass;
    case "DiceRolled":
      // FR-GM-22: a player learns that *something* happened at this seq, never what.
      return e.roll.visibility === "gm" ? redacted : pass;
    case "InitiativeStarted":
    case "InitiativeAdvanced":
      // The order may name hidden tokens, so the player gets a filtered snapshot instead
      // of the raw event — same reasoning as a reveal.
      return { kind: "resync" };
    case "InitiativeEnded":
      return pass;
    case "TemplatePlaced":
    case "TemplateRemoved":
      // gmOnly never changes after placement, so the event itself says whether a player may see it.
      return e.template.gmOnly ? redacted : pass;
    case "TokenHiddenSet":
      // A reveal must deliver the whole token; a hide must remove it. A snapshot does both.
      return { kind: "resync" };
    case "RoomCreated":
    case "ParticipantJoined":
    case "ParticipantRenamed":
    case "ParticipantLeft":
    case "ParticipantRevoked":
    case "MapSet":
    case "GridSet":
      // The participant list is public; leaving or removal reveals nothing hidden (ADR 0006).
      return pass;
  }
}

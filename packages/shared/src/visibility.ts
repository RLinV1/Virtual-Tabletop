import type { AttackSide, DiceRoll } from "./dice";
import type { CommittedEvent } from "./events";
import type { Initiative, Participant, RoomState } from "./state";

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
  const rolls = state.rolls.filter((r) => r.visibility === "public").map((r) => hideAttackSides(r, state));
  // A hidden token must not be inferable from a gap in the turn order (FR-GM-23).
  const initiative = state.initiative ? initiativeForPlayer(state.initiative, tokens) : null;
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
      if (e.roll.visibility === "gm") return redacted;
      // A public attack naming a hidden token reaches players only through a filtered snapshot,
      // which blanks that side (ADR 0010).
      return [e.roll.attack?.actor, e.roll.attack?.target].some((side) => side && (side.hidden || hiddenBefore(side.tokenId)))
        ? { kind: "resync" }
        : pass;
    case "RollRuled":
    case "RollDamageApplied": {
      // Neither names a token; they are as secret as the roll they concern (ADR 0011).
      const roll = before.rolls.find((r) => r.id === e.rollId);
      if (!roll || roll.visibility === "gm") return redacted;
      // "Applied" on a roll whose target the player sees as Unknown would say that token still
      // exists and has HP, and line it up with the HP change just before it. Withhold it.
      const target = roll.attack?.target;
      if (e.type === "RollDamageApplied" && target && (target.hidden || hiddenBefore(target.tokenId))) return redacted;
      return pass;
    }
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

/**
 * A player's copy of an attack roll: a side naming a token hidden from them becomes `null` (ADR 0010).
 * `side.hidden` is set when rolled against a hidden token and again whenever it is hidden later
 * (see `reduce`), so it stays null after a reveal, rename or delete. A token only ever visible,
 * even once deleted, keeps its name, which the player already saw.
 */
function hideAttackSides(roll: DiceRoll, state: RoomState): DiceRoll {
  if (!roll.attack) return roll;
  const conceal = (side: AttackSide | null) =>
    !side || side.hidden || state.tokens[side.tokenId]?.hidden ? null : side;
  const actor = conceal(roll.attack.actor);
  const target = conceal(roll.attack.target);
  if (actor === roll.attack.actor && target === roll.attack.target) return roll;
  // With the target blanked, "Applied" would still say the hidden token exists with HP (ADR 0011).
  const { damageApplied: _applied, ...withoutApplied } = roll;
  const base = target === null && roll.attack.target !== null ? withoutApplied : roll;
  return { ...base, attack: { ...roll.attack, actor, target } };
}

/**
 * A player's turn order: hidden tokens left out, and `activeIndex` pointing into what is left
 * (FR-GM-21, FR-GM-23). The GM's index would point at the wrong token, or past the end, and so
 * give away that hidden combatants are in the order. On a hidden token's turn the index is one
 * past the end, so no token shows as active; it stays within the schema (a non-negative integer).
 */
function initiativeForPlayer(initiative: Initiative, visible: RoomState["tokens"]): Initiative {
  const order = initiative.order.filter((id) => visible[id]);
  const activeId = initiative.order[initiative.activeIndex];
  const index = activeId === undefined ? -1 : order.indexOf(activeId);
  return { ...initiative, order, activeIndex: index === -1 ? order.length : index };
}

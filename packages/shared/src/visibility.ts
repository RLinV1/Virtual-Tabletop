import type { AttackSide, DiceRoll } from "./dice";
import type { CommittedEvent } from "./events";
import { pointInPolygon, type Point } from "./geometry";
import type { AreaTemplate, Initiative, Participant, RoomState, Token } from "./state";

/** Whether a board point lies under any fog region (FR-GM-17, ADR 0016). */
export function isInFog(fog: RoomState["fog"], point: Point): boolean {
  for (const region of Object.values(fog)) if (pointInPolygon(point, region.points)) return true;
  return false;
}

/**
 * Whether `viewer` may not see `token` (FR-GM-16, FR-GM-17, FR-GM-23): it is hidden, or its
 * centre is under fog and the viewer doesn't own it. The GM sees everything. The one rule every
 * filter and the ephemeral relay use, so they can't disagree (ADR 0016).
 */
export function concealedFrom(
  fog: RoomState["fog"],
  token: Pick<Token, "hidden" | "position" | "ownerIds">,
  viewer: Participant,
): boolean {
  if (viewer.role === "gm") return false;
  if (token.hidden) return true;
  return !token.ownerIds.includes(viewer.id) && isInFog(fog, token.position);
}

/**
 * Whether fog conceals a token's side on attack rolls for good (ADR 0016): an unowned token under
 * fog. Owned tokens are the party's; players saw their names already, so their sides follow the
 * token's current visibility instead.
 */
export function fogConcealsSide(state: Pick<RoomState, "fog">, token: Pick<Token, "ownerIds" | "position">): boolean {
  return token.ownerIds.length === 0 && isInFog(state.fog, token.position);
}

/** Whether `viewer` may not see a template: GM-only, or placed by someone else under fog (ADR 0007, ADR 0016). */
export function templateConcealedFrom(fog: RoomState["fog"], template: AreaTemplate, viewer: Participant): boolean {
  if (viewer.role === "gm") return false;
  if (template.gmOnly) return true;
  return template.ownerId !== viewer.id && isInFog(fog, template.origin);
}

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
  // Hidden tokens, and tokens under fog the viewer doesn't own, are withheld (FR-GM-17).
  const tokens = Object.fromEntries(
    Object.entries(state.tokens).filter(([, t]) => !concealedFrom(state.fog, t, viewer))
      .map(([id, token]) => [id, tokenForViewer(token, viewer)]),
  );
  // GM-only rolls never reach a player, not even as a redacted placeholder (FR-GM-22).
  const rolls = state.rolls.filter((r) => r.visibility === "public").map((r) => hideAttackSides(r, state, tokens));
  // A hidden token must not be inferable from a gap in the turn order (FR-GM-23).
  const initiative = state.initiative ? initiativeForPlayer(state.initiative, tokens) : null;
  // GM-only area templates are withheld entirely, like hidden tokens (ADR 0007), and so are
  // other people's templates under fog (ADR 0016).
  const templates = Object.fromEntries(
    Object.entries(state.templates).filter(([, t]) => !templateConcealedFrom(state.fog, t, viewer)),
  );
  // Fog regions stay: they are the mask the player's board draws, and name nothing (ADR 0016).
  // Chat is public, so `chat` stays as it is in the spread below (ADR 0015).
  // Undo is GM-only, and its entries name hidden tokens and their old values (ADR 0013).
  // Groups are the GM's organisation and would say which group a hidden token is in (KAN-82, ADR 0026).
  return { ...state, tokens, rolls, initiative, templates, undo: [], checkpoints: [], groups: {}, tokenGroups: {} };
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
  // No `commandId` for players: an id shared with a redacted event would say a hidden change
  // was part of the same action (ADR 0013).
  const { commandId: _commandId, ...withoutCommandId } = committed;
  const pass: FilteredEvent = { kind: "event", committed: withoutCommandId };
  /** Whether the viewer could not see this token before the event; unknown tokens count as hidden. */
  const hiddenBefore = (tokenId: string) => {
    const token = before.tokens[tokenId];
    return !token || concealedFrom(before.fog, token, viewer);
  };
  /** Same before and after: as-is or redacted. Changed: the token appears or vanishes, so resync. */
  const byVisibility = (wasConcealed: boolean, isConcealed: boolean): FilteredEvent =>
    wasConcealed !== isConcealed ? { kind: "resync" } : isConcealed ? redacted : pass;

  switch (e.type) {
    case "TokenCreated":
    case "TokenDeleted":
      return concealedFrom(before.fog, e.token, viewer) ? redacted : {
        kind: "event", committed: { ...withoutCommandId, event: { ...e, token: tokenForViewer(e.token, viewer) } },
      };
    case "TokenMoved": {
      // Moving into or out of fog changes what the viewer may see (ADR 0016).
      const token = before.tokens[e.tokenId];
      if (!token) return redacted;
      return byVisibility(concealedFrom(before.fog, token, viewer), concealedFrom(before.fog, { ...token, position: e.to }, viewer));
    }
    case "TokenOwnersSet": {
      // Gaining or losing a token under fog reveals or withdraws it for that player (ADR 0016).
      const token = before.tokens[e.tokenId];
      if (!token) return redacted;
      // Ownership also determines whether the copied named attacks are available.
      if (token.attacks?.length && token.ownerIds.includes(viewer.id) !== e.ownerIds.includes(viewer.id)) return { kind: "resync" };
      return byVisibility(concealedFrom(before.fog, token, viewer), concealedFrom(before.fog, { ...token, ownerIds: e.ownerIds }, viewer));
    }
    case "TokenAppearanceSet":
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
    case "RollDamageApplied":
    case "RollDamageUnapplied": {
      // Neither names a token; they are as secret as the roll they concern (ADR 0011).
      const roll = before.rolls.find((r) => r.id === e.rollId);
      if (!roll || roll.visibility === "gm") return redacted;
      // "Applied" on a roll whose target the player sees as Unknown would say that token still
      // exists and has HP, and line it up with the HP change just before it. Withhold it.
      const target = roll.attack?.target;
      if (e.type !== "RollRuled" && target && (target.hidden || hiddenBefore(target.tokenId))) return redacted;
      return pass;
    }
    case "InitiativeStarted":
    case "InitiativeAdvanced":
    case "InitiativeStartUndone":
      // The order may name hidden tokens, so the player gets a filtered snapshot instead
      // of the raw event — same reasoning as a reveal.
      return { kind: "resync" };
    case "InitiativeEnded": {
      // `previous` is the GM's whole order: strip concealed tokens from it, as a snapshot would.
      const visible = filterStateForViewer(before, viewer).tokens;
      return { kind: "event", committed: { ...withoutCommandId, event: { ...e, previous: initiativeForPlayer(e.previous, visible) } } };
    }
    case "TemplatePlaced":
    case "TemplateRemoved":
      // gmOnly never changes after placement, and fog changes only through FogAdded/FogRemoved,
      // which resync; so the fog before this event is the fog the player's state reflects.
      return templateConcealedFrom(before.fog, e.template, viewer) ? redacted : pass;
    case "FogAdded":
    case "FogRemoved":
      // Fog can hide or reveal any number of tokens and templates; a snapshot does both (ADR 0016).
      return { kind: "resync" };
    case "TokenHiddenSet":
      // A reveal must deliver the whole token; a hide must remove it. A snapshot does both.
      return { kind: "resync" };
    case "GroupCreated":
    case "GroupRenamed":
    case "GroupDeleted":
    case "TokensGrouped":
      // GM-only: a player learns only that a seq passed (KAN-82, ADR 0026).
      return redacted;
    case "CheckpointCreated":
      // Checkpoints are the GM's; a player learns only that a seq passed (ADR 0019).
      return redacted;
    case "CheckpointRestored":
      // Both tables hold hidden tokens and GM-only areas; a filtered snapshot carries the rest.
      return { kind: "resync" };
    case "EncounterApplied":
      // Both boards hold hidden tokens, fog and owners; a filtered snapshot carries the rest (ADR 0024).
      return { kind: "resync" };
    case "ActionUndone":
      // Players have no undo or activity log; the compensating events before it already
      // delivered whatever they may see (ADR 0013).
      return redacted;
    case "ChatMessageSent":
      // Chat is public to the whole room; it names no hidden token or roll (ADR 0015).
      return pass;
    case "RoomCreated":
    case "ParticipantJoined":
    case "ParticipantRenamed":
    case "ParticipantDiceLookSet":
    case "ParticipantLeft":
    case "ParticipantRevoked":
    case "MapSet":
    case "GridSet":
      // The participant list is public; leaving or removal reveals nothing hidden (ADR 0006). A
      // dice look is pictures the whole table sees on that person's rolls, and names no account (ADR 0018).
      return pass;
  }
}

/** Named attacks are private to the GM and the token's owners, including on deletion/undo. */
function tokenForViewer(token: Token, viewer: Participant): Token {
  if (viewer.role === "gm" || token.ownerIds.includes(viewer.id)) return token;
  const { attacks: _attacks, ...visible } = token;
  return visible;
}

/**
 * A player's copy of an attack roll: a side naming a token hidden from them becomes `null` (ADR 0010).
 * `side.hidden` is set when rolled against a hidden token and again whenever it is hidden later
 * (see `reduce`), so it stays null after a reveal, rename or delete. A token only ever visible,
 * even once deleted, keeps its name, which the player already saw.
 */
function hideAttackSides(roll: DiceRoll, state: RoomState, visible: RoomState["tokens"]): DiceRoll {
  if (!roll.attack) return roll;
  // A side whose token still exists but is not in the viewer's tokens is hidden or under fog.
  const conceal = (side: AttackSide | null) =>
    !side || side.hidden || (state.tokens[side.tokenId] && !visible[side.tokenId]) ? null : side;
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

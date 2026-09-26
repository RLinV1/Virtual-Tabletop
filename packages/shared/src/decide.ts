import type { Command, DepartureAction } from "./commands";
import { EMPTY_STATS } from "./conditions";
import { formatExpression, parseDiceExpression, rollDice } from "./dice";
import type { DomainEvent } from "./events";
import { MAX_AREA_TEMPLATES, type AreaTemplate, type Initiative, type Participant, type RoomState, type Token } from "./state";

export type RejectionCode = "forbidden" | "not_found" | "invalid";

export type Decision =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; code: RejectionCode; message: string };

export interface DecideContext {
  newId: () => string;
  /**
   * Float in [0, 1). Injected rather than taken from `Math.random` so `decide` stays
   * deterministic and testable (CLAUDE.md invariant 2). Only dice use it.
   */
  random?: () => number;
}

/** Permission helpers. Shared so the UI can hide controls, but ONLY the server's check counts. */
export const can = {
  administer: (actor: Participant) => actor.role === "gm",
  moveToken: (actor: Participant, token: Token) =>
    actor.role === "gm" || token.ownerIds.includes(actor.id),
  /** Owners track their own resources; the GM tracks everyone's (FR-TAC-07). */
  editToken: (actor: Participant, token: Token) =>
    actor.role === "gm" || token.ownerIds.includes(actor.id),
  /** Only the GM may roll where players cannot see the result (FR-GM-22). */
  rollHidden: (actor: Participant) => actor.role === "gm",
  /** Whoever placed a template may remove it; the GM may remove any (ADR 0007). */
  removeTemplate: (actor: Participant, template: AreaTemplate) =>
    actor.role === "gm" || template.ownerId === actor.id,
};

/**
 * Turns a validated command into events, or rejects it (FR-GM-15).
 * Pure: the server calls this inside its per-room ordered queue, then appends the events.
 */
export function decide(
  state: RoomState,
  actor: Participant,
  command: Command,
  ctx: DecideContext,
): Decision {
  switch (command.type) {
    case "scene.setMap":
      if (!can.administer(actor)) return forbidden();
      // One event, not MapSet + GridSet: a library map and its grid are one undoable step (ADR 0004).
      return accept(
        command.grid
          ? {
              type: "MapSet",
              map: command.map,
              previous: state.scene.map,
              gridChange: { grid: command.grid, previous: state.scene.grid },
            }
          : { type: "MapSet", map: command.map, previous: state.scene.map },
      );

    case "scene.setGrid":
      if (!can.administer(actor)) return forbidden();
      return accept({ type: "GridSet", grid: command.grid, previous: state.scene.grid });

    case "token.create": {
      if (!can.administer(actor)) return forbidden();
      const ownerError = checkOwners(state, command.ownerIds);
      if (ownerError) return ownerError;
      if (!command.name.trim()) return reject("invalid", "Token name can't be blank.");
      return accept({
        type: "TokenCreated",
        token: {
          id: ctx.newId(),
          // Duplicates are numbered, not rejected: placing five goblins is routine (KAN-62).
          name: uniqueTokenName(state, command.name),
          position: command.position,
          size: command.size,
          rotation: 0,
          color: command.color,
          imageUrl: command.imageUrl,
          assetId: command.assetId,
          ownerIds: command.ownerIds,
          hidden: command.hidden,
          stats: EMPTY_STATS,
          conditions: [],
        },
      });
    }

    case "token.move": {
      const token = state.tokens[command.tokenId];
      // A player asking about a token they can't see gets the same answer as a missing one,
      // so rejections don't leak the existence of hidden tokens (FR-GM-23).
      if (!token || (token.hidden && !can.administer(actor))) return notFound("token");
      if (!can.moveToken(actor, token)) return forbidden();
      return accept({
        type: "TokenMoved",
        tokenId: token.id,
        from: token.position,
        to: command.to,
      });
    }

    case "token.delete": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      return accept({ type: "TokenDeleted", token });
    }

    case "token.setOwners": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      const ownerError = checkOwners(state, command.ownerIds);
      if (ownerError) return ownerError;
      return accept({
        type: "TokenOwnersSet",
        tokenId: token.id,
        ownerIds: [...new Set(command.ownerIds)],
        previous: token.ownerIds,
      });
    }

    case "token.setHidden": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      if (token.hidden === command.hidden) return { ok: true, events: [] };
      return accept({
        type: "TokenHiddenSet",
        tokenId: token.id,
        hidden: command.hidden,
        previous: token.hidden,
      });
    }

    case "token.setStats": {
      const token = state.tokens[command.tokenId];
      if (!token || (token.hidden && !can.administer(actor))) return notFound("token");
      if (!can.editToken(actor, token)) return forbidden();
      if (command.stats.hp !== null && command.stats.maxHp !== null && command.stats.hp > command.stats.maxHp) {
        return reject("invalid", "Current HP cannot exceed maximum HP");
      }
      return accept({
        type: "TokenStatsSet",
        tokenId: token.id,
        stats: command.stats,
        previous: token.stats,
      });
    }

    case "token.setConditions": {
      const token = state.tokens[command.tokenId];
      if (!token || (token.hidden && !can.administer(actor))) return notFound("token");
      if (!can.editToken(actor, token)) return forbidden();
      return accept({
        type: "TokenConditionsSet",
        tokenId: token.id,
        conditions: [...new Set(command.conditions)],
        previous: token.conditions,
      });
    }

    case "initiative.start": {
      if (!can.administer(actor)) return forbidden();
      const unknown = command.entries.find((e) => !state.tokens[e.tokenId]);
      if (unknown) return notFound("token");
      // Sort here, not on the client: turn order is authoritative state, and two clients
      // sorting a tie differently would diverge. Ties break by token id for determinism.
      const order = [...command.entries]
        .sort((a, b) => b.score - a.score || a.tokenId.localeCompare(b.tokenId))
        .map((e) => e.tokenId);
      const deduped = [...new Set(order)];
      if (deduped.length !== order.length) return reject("invalid", "A token appears twice in the order");
      return accept({
        type: "InitiativeStarted",
        initiative: { order: deduped, activeIndex: 0, round: 1 },
        previous: state.initiative,
      });
    }

    case "initiative.advance": {
      if (!can.administer(actor)) return forbidden();
      const current = state.initiative;
      if (!current) return reject("invalid", "No encounter is running");
      return accept({
        type: "InitiativeAdvanced",
        initiative: advance(current),
        previous: current,
      });
    }

    case "initiative.end": {
      if (!can.administer(actor)) return forbidden();
      if (!state.initiative) return { ok: true, events: [] };
      return accept({ type: "InitiativeEnded", previous: state.initiative });
    }

    case "dice.roll": {
      if (command.visibility === "gm" && !can.rollHidden(actor)) return forbidden();
      const parsed = parseDiceExpression(command.expression);
      if (!parsed.ok) return reject("invalid", parsed.message);
      const random = ctx.random;
      if (!random) return reject("invalid", "Dice are unavailable");
      const { dice, total } = rollDice(parsed.expression, random);
      return accept({
        type: "DiceRolled",
        roll: {
          id: ctx.newId(),
          expression: formatExpression(parsed.expression),
          byParticipantId: actor.id,
          dice,
          modifier: parsed.expression.modifier,
          total,
          visibility: command.visibility,
        },
      });
    }

    case "template.place": {
      // Only the GM hides things from players, as with hidden tokens and GM-only rolls.
      if (command.gmOnly && !can.administer(actor)) return forbidden();
      if (Object.keys(state.templates).length >= MAX_AREA_TEMPLATES) {
        return reject("invalid", `A room can hold at most ${MAX_AREA_TEMPLATES} area templates. Remove some first.`);
      }
      return accept({
        type: "TemplatePlaced",
        template: {
          id: ctx.newId(),
          shape: command.shape,
          origin: command.origin,
          toward: command.toward,
          size: command.size,
          ownerId: actor.id,
          gmOnly: command.gmOnly,
        },
      });
    }

    case "template.remove": {
      const template = state.templates[command.templateId];
      // A GM-only template answers a player exactly like a missing one (FR-GM-23).
      if (!template || (template.gmOnly && !can.administer(actor))) return notFound("template");
      if (!can.removeTemplate(actor, template)) return forbidden();
      return accept({ type: "TemplateRemoved", template });
    }

    case "participant.rename": {
      const displayName = command.displayName.trim();
      if (!displayName) return reject("invalid", BLANK_NAME);
      if (isDisplayNameTaken(state, displayName, actor.id)) return reject("invalid", nameTaken(displayName));
      return accept({
        type: "ParticipantRenamed",
        participantId: actor.id,
        displayName,
        previous: actor.displayName,
      });
    }

    case "participant.leave":
      // The room would be left without anyone who can administer it. The GM's way out is
      // the Home link, which only closes their socket (ADR 0006).
      if (can.administer(actor)) return reject("invalid", "The GM can't leave their own room.");
      return accept({ type: "ParticipantLeft", participant: actor });

    case "participant.resolveDeparture":
      if (!can.administer(actor)) return forbidden();
      return resolveDeparture(state, command.participantId, command.actions);
  }
}

/**
 * Turns the GM's per-token choices into existing token events (ADR 0006). Every action is
 * validated before any event is produced, so the command is all-or-nothing.
 */
function resolveDeparture(state: RoomState, participantId: string, actions: DepartureAction[]): Decision {
  const departed = state.participants[participantId];
  if (!departed) return notFound("participant");
  if (isActive(departed)) return reject("invalid", `${departed.displayName} hasn't left the room.`);

  const seen = new Set<string>();
  for (const a of actions) {
    if (seen.has(a.tokenId)) return reject("invalid", "A token appears twice in the resolution");
    seen.add(a.tokenId);
    const token = state.tokens[a.tokenId];
    if (!token) return notFound("token");
    if (!token.ownerIds.includes(departed.id)) {
      return reject("invalid", `${token.name} is no longer owned by ${departed.displayName}.`);
    }
    if (a.action === "reassign") {
      const to = state.participants[a.to];
      if (!to) return notFound("participant");
      if (to.role !== "player" || !isActive(to)) {
        return reject("invalid", `${to.displayName} can't be given tokens: choose a player who is still in the room.`);
      }
    }
  }

  const events = actions.map((a): DomainEvent => {
    const token = state.tokens[a.tokenId]!;
    switch (a.action) {
      case "delete":
        return { type: "TokenDeleted", token };
      case "unassign":
        return {
          type: "TokenOwnersSet",
          tokenId: token.id,
          ownerIds: token.ownerIds.filter((id) => id !== departed.id),
          previous: token.ownerIds,
        };
      case "reassign":
        return {
          type: "TokenOwnersSet",
          tokenId: token.id,
          ownerIds: [...new Set(token.ownerIds.map((id) => (id === departed.id ? a.to : id)))],
          previous: token.ownerIds,
        };
    }
  });
  return { ok: true, events };
}

/** Owners must exist and still be in the room: a departed player can't be handed a token. */
function checkOwners(state: RoomState, ownerIds: string[]): Decision | null {
  for (const id of ownerIds) {
    const owner = state.participants[id];
    if (!owner) return reject("not_found", `Unknown participant ${id}`);
    if (!isActive(owner)) return reject("invalid", `${owner.displayName} has left the room.`);
  }
  return null;
}


/** Comparison key for names: "raymond", "Raymond " and "RAYMOND" are one name (KAN-61, KAN-62). */
export const normalizeName = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("en-US");
/** Display names compare the same way as every other name. Kept for KAN-61 callers. */
export const normalizeDisplayName = normalizeName;

/** True when a token other than `exceptId` already uses `name` in this room. Hidden tokens count. */
export function isTokenNameTaken(state: RoomState, name: string, exceptId?: string) {
  const key = normalizeName(name);
  return Object.values(state.tokens).some((t) => t.id !== exceptId && normalizeName(t.name) === key);
}

const MAX_TOKEN_NAME = 60;

/**
 * The name a new token actually gets (KAN-62): `name` trimmed if it's free, otherwise its base
 * plus the lowest free number from 2 ("Goblin" -> "Goblin 2"). A typed trailing number is part of
 * the suffix, so a taken "Goblin 2" becomes "Goblin 3", not "Goblin 2 2". Depends on `state` only,
 * so it's deterministic; the result goes into `TokenCreated`, so replay never re-runs it.
 */
export function uniqueTokenName(state: RoomState, name: string): string {
  const trimmed = name.trim();
  const taken = new Set(Object.values(state.tokens).map((t) => normalizeName(t.name)));
  if (!taken.has(normalizeName(trimmed))) return trimmed;
  const base = trimmed.replace(/\s+\d+$/, "") || trimmed;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, MAX_TOKEN_NAME - suffix.length).trimEnd() + suffix;
    if (!taken.has(normalizeName(candidate))) return candidate;
  }
}

/**
 * Whether a participant is still in the room: holds their name, may act, may connect, may own
 * tokens. Leaving (ADR 0006) is the only way to stop; revocation (FR-GM-20) will extend this.
 */
export const isActive = (participant: Participant) => !participant.left;

/** Departed participants still named as a token owner: what the GM has yet to resolve (ADR 0006). */
export function pendingDepartures(state: RoomState): { participant: Participant; tokenIds: string[] }[] {
  return Object.values(state.participants)
    .filter((p) => !isActive(p))
    .map((participant) => ({
      participant,
      tokenIds: Object.values(state.tokens)
        .filter((t) => t.ownerIds.includes(participant.id))
        .map((t) => t.id),
    }))
    .filter((d) => d.tokenIds.length > 0);
}

/** True when an active participant other than `exceptId` already uses `name` in this room. */
export function isDisplayNameTaken(state: RoomState, name: string, exceptId?: string) {
  const key = normalizeDisplayName(name);
  return Object.values(state.participants).some(
    (p) => p.id !== exceptId && isActive(p) && normalizeDisplayName(p.displayName) === key,
  );
}

/** Server-side detail so the join route can pick 400 vs 409. Never sent to clients. */
export type JoinRejectionReason = "blank" | "name_taken";
export type JoinDecision =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; code: RejectionCode; message: string; reason: JoinRejectionReason };

/**
 * Joining is an unauthenticated HTTP action with no actor, so it isn't a `Command`; this is its
 * `decide`. The server runs it inside the room's ordered queue, so two joins racing for one name
 * can't both pass (KAN-61).
 */
export function decideJoin(state: RoomState, participant: Participant): JoinDecision {
  const displayName = participant.displayName.trim();
  if (!displayName) return { ok: false, code: "invalid", message: BLANK_NAME, reason: "blank" };
  if (isDisplayNameTaken(state, displayName)) {
    return { ok: false, code: "invalid", message: nameTaken(displayName), reason: "name_taken" };
  }
  return { ok: true, events: [{ type: "ParticipantJoined", participant: { ...participant, displayName } }] };
}

const BLANK_NAME = "Display name can't be blank.";
const nameTaken = (name: string) => `The name "${name}" is already taken in this room. Choose another name.`;

/**
 * Next turn. Wrapping past the last entry starts a new round (FR-GM-21).
 * Entries whose token was deleted mid-encounter are skipped rather than removed, because
 * `order` is carried in the event and history is never rewritten.
 */
function advance(current: Initiative): Initiative {
  const next = current.activeIndex + 1;
  return next >= current.order.length
    ? { ...current, activeIndex: 0, round: current.round + 1 }
    : { ...current, activeIndex: next };
}

const accept = (...events: DomainEvent[]): Decision => ({ ok: true, events });
const reject = (code: RejectionCode, message: string): Decision => ({ ok: false, code, message });
const forbidden = () => reject("forbidden", "You are not allowed to do that");
const notFound = (what: string) => reject("not_found", `No such ${what}`);

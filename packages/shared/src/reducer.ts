import type { DiceRoll } from "./dice";
import type { CommittedEvent, DomainEvent } from "./events";
import { ROLL_LOG_LIMIT, type RoomState } from "./state";
import { eventMeta, recordUndo, type EventMeta } from "./undo";

/**
 * Pure state transition. The ONLY way RoomState changes, on both server and client.
 * Must stay deterministic: no I/O, no clocks, no randomness.
 *
 * Throws if an event references something that doesn't exist — that means the event
 * stream is corrupt or out of order, and the caller must resynchronize.
 *
 * With `meta` (the event's action grouping), it also keeps the undo history (ADR 0013).
 * Without it, state changes the same way and the history is left alone.
 */
export function reduce(state: RoomState, event: DomainEvent, meta?: EventMeta): RoomState {
  const next = apply(state, event);
  if (event.type === "ActionUndone") {
    // Drops the undone action, and the entry this undo's own inverse events just opened,
    // so an undo is never itself undoable (no redo).
    const undo = state.undo.filter((e) => e.commandId !== event.commandId && e.commandId !== meta?.commandId);
    return { ...next, undo };
  }
  return meta ? { ...next, undo: recordUndo(state, event, meta) } : next;
}

/** `reduce` for a committed event, grouping it into its action for undo. */
export function reduceCommitted(state: RoomState, committed: CommittedEvent): RoomState {
  return reduce(state, committed.event, eventMeta(committed));
}

/** The state change for one event, without the undo history (`reduce` adds that). */
function apply(state: RoomState, event: DomainEvent): RoomState {
  switch (event.type) {
    case "RoomCreated":
      return { ...state, name: event.name };

    case "ParticipantJoined":
      return {
        ...state,
        participants: { ...state.participants, [event.participant.id]: event.participant },
      };

    case "ParticipantRenamed": {
      const p = required(state.participants[event.participantId], event);
      return {
        ...state,
        participants: {
          ...state.participants,
          [p.id]: { ...p, displayName: event.displayName },
        },
      };
    }

    case "ParticipantLeft": {
      const p = required(state.participants[event.participant.id], event);
      return { ...state, participants: { ...state.participants, [p.id]: { ...p, left: true } } };
    }

    case "ParticipantRevoked": {
      const p = required(state.participants[event.participant.id], event);
      // Only the flag. Tokens keep naming them until the GM resolves each one (ADR 0006).
      return { ...state, participants: { ...state.participants, [p.id]: { ...p, revoked: true } } };
    }

    case "MapSet":
      return { ...state, scene: { ...state.scene, map: event.map, grid: event.gridChange?.grid ?? state.scene.grid } };

    case "GridSet":
      return { ...state, scene: { ...state.scene, grid: event.grid } };

    case "TokenCreated":
      return { ...state, tokens: { ...state.tokens, [event.token.id]: event.token } };

    case "TokenMoved": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, position: event.to } } };
    }

    case "TokenAppearanceSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, name: event.name, size: event.size, rotation: event.rotation } } };
    }

    case "TokenDeleted": {
      required(state.tokens[event.token.id], event);
      const { [event.token.id]: _removed, ...rest } = state.tokens;
      return { ...state, tokens: rest };
    }

    case "TokenOwnersSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, ownerIds: event.ownerIds } } };
    }

    case "TokenHiddenSet": {
      const t = required(state.tokens[event.tokenId], event);
      const tokens = { ...state.tokens, [t.id]: { ...t, hidden: event.hidden } };
      return { ...state, tokens, rolls: event.hidden ? concealInRolls(state.rolls, t.id) : state.rolls };
    }

    case "TokenStatsSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, stats: event.stats } } };
    }

    case "TokenImageSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, imageUrl: event.imageUrl, assetId: event.assetId ?? null } } };
    }

    case "TokenConditionsSet": {
      const t = required(state.tokens[event.tokenId], event);
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, conditions: event.conditions } } };
    }

    case "InitiativeStarted":
    case "InitiativeAdvanced":
      return { ...state, initiative: event.initiative };

    case "InitiativeEnded":
      return { ...state, initiative: null };

    case "DiceRolled": {
      // Stored events are loaded without parsing, so an attack roll from before ADR 0011 arrives
      // with no `kind`; the schema's default only applies on parse. Fill it in here instead.
      const roll = event.roll.attack && !event.roll.attack.kind
        ? { ...event.roll, attack: { ...event.roll.attack, kind: "toHit" as const } }
        : event.roll;
      // Newest last, oldest dropped. The full history stays in the event log (FR-REC-01);
      // state keeps only what the roll panel shows.
      return { ...state, rolls: [...state.rolls, roll].slice(-ROLL_LOG_LIMIT) };
    }

    // A roll that has left the window (or a player's copy never had) is simply not there to
    // update; `decide` only rules on rolls it can see, so this stays safe on replay (ADR 0011).
    case "RollRuled":
      return updateRoll(state, event.rollId, (roll) => {
        const { verdict: _old, ...rest } = roll;
        return event.verdict ? { ...rest, verdict: event.verdict } : rest;
      });

    case "RollDamageApplied":
      return updateRoll(state, event.rollId, (roll) => ({ ...roll, damageApplied: true }));

    case "RollDamageUnapplied":
      return updateRoll(state, event.rollId, (roll) => {
        const { damageApplied: _applied, ...rest } = roll;
        return rest;
      });

    case "TemplatePlaced":
      return { ...state, templates: { ...state.templates, [event.template.id]: event.template } };

    case "TemplateRemoved": {
      required(state.templates[event.template.id], event);
      const { [event.template.id]: _removed, ...rest } = state.templates;
      return { ...state, templates: rest };
    }

    // Its compensating events already restored the values; `reduce` updates the history.
    case "ActionUndone":
      return state;

    default:
      return assertNever(event);
  }
}

export function reduceAll(state: RoomState, events: Iterable<DomainEvent>): RoomState {
  let s = state;
  for (const e of events) s = reduce(s, e);
  return s;
}

function required<T>(value: T | undefined, event: DomainEvent): T {
  if (value === undefined) {
    throw new Error(`Event ${event.type} references a missing entity`);
  }
  return value;
}

function updateRoll(state: RoomState, rollId: string, update: (roll: DiceRoll) => DiceRoll): RoomState {
  if (!state.rolls.some((r) => r.id === rollId)) return state;
  return { ...state, rolls: state.rolls.map((r) => (r.id === rollId ? update(r) : r)) };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(x)}`);
}

/**
 * Marks a token hidden on every attack roll that names it (ADR 0010). Once hidden, a roll's
 * side stays concealed from players for good: a later reveal, rename or delete must not bring
 * back a name or id they never saw, or tell them the hidden token is gone.
 */
function concealInRolls(rolls: RoomState["rolls"], tokenId: string): RoomState["rolls"] {
  const conceal = <S extends { tokenId: string; hidden: boolean } | null>(side: S): S =>
    side && side.tokenId === tokenId && !side.hidden ? { ...side, hidden: true } : side;
  let changed = false;
  const next = rolls.map((roll) => {
    if (!roll.attack) return roll;
    const actor = conceal(roll.attack.actor);
    const target = conceal(roll.attack.target);
    if (actor === roll.attack.actor && target === roll.attack.target) return roll;
    changed = true;
    return { ...roll, attack: { ...roll.attack, actor, target } };
  });
  return changed ? next : rolls;
}

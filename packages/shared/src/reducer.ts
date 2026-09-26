import type { DomainEvent } from "./events";
import { ROLL_LOG_LIMIT, type RoomState } from "./state";

/**
 * Pure state transition. The ONLY way RoomState changes, on both server and client.
 * Must stay deterministic: no I/O, no clocks, no randomness.
 *
 * Throws if an event references something that doesn't exist — that means the event
 * stream is corrupt or out of order, and the caller must resynchronize.
 */
export function reduce(state: RoomState, event: DomainEvent): RoomState {
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
      return { ...state, tokens: { ...state.tokens, [t.id]: { ...t, hidden: event.hidden } } };
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

    case "DiceRolled":
      // Newest last, oldest dropped. The full history stays in the event log (FR-REC-01);
      // state keeps only what the roll panel shows.
      return { ...state, rolls: [...state.rolls, event.roll].slice(-ROLL_LOG_LIMIT) };

    case "TemplatePlaced":
      return { ...state, templates: { ...state.templates, [event.template.id]: event.template } };

    case "TemplateRemoved": {
      required(state.templates[event.template.id], event);
      const { [event.template.id]: _removed, ...rest } = state.templates;
      return { ...state, templates: rest };
    }

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

function assertNever(x: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(x)}`);
}

import type { Command } from "./commands";
import type { DomainEvent } from "./events";
import type { Participant, RoomState, Token } from "./state";

export type RejectionCode = "forbidden" | "not_found" | "invalid";

export type Decision =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; code: RejectionCode; message: string };

export interface DecideContext {
  newId: () => string;
}

/** Permission helpers. Shared so the UI can hide controls, but ONLY the server's check counts. */
export const can = {
  administer: (actor: Participant) => actor.role === "gm",
  moveToken: (actor: Participant, token: Token) =>
    actor.role === "gm" || token.ownerIds.includes(actor.id),
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
      return accept({ type: "MapSet", map: command.map, previous: state.scene.map });

    case "scene.setGrid":
      if (!can.administer(actor)) return forbidden();
      return accept({ type: "GridSet", grid: command.grid, previous: state.scene.grid });

    case "token.create": {
      if (!can.administer(actor)) return forbidden();
      const unknownOwner = command.ownerIds.find((id) => !state.participants[id]);
      if (unknownOwner) return reject("not_found", `Unknown participant ${unknownOwner}`);
      return accept({
        type: "TokenCreated",
        token: {
          id: ctx.newId(),
          name: command.name,
          position: command.position,
          size: command.size,
          rotation: 0,
          color: command.color,
          imageUrl: command.imageUrl,
          ownerIds: command.ownerIds,
          hidden: command.hidden,
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
      const unknownOwner = command.ownerIds.find((id) => !state.participants[id]);
      if (unknownOwner) return reject("not_found", `Unknown participant ${unknownOwner}`);
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

    case "participant.rename":
      return accept({
        type: "ParticipantRenamed",
        participantId: actor.id,
        displayName: command.displayName,
        previous: actor.displayName,
      });
  }
}

const accept = (...events: DomainEvent[]): Decision => ({ ok: true, events });
const reject = (code: RejectionCode, message: string): Decision => ({ ok: false, code, message });
const forbidden = () => reject("forbidden", "You are not allowed to do that");
const notFound = (what: string) => reject("not_found", `No such ${what}`);

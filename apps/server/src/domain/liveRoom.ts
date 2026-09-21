import { randomUUID } from "node:crypto";
import {
  can,
  decide,
  emptyRoomState,
  filterEventForViewer,
  filterStateForViewer,
  reduce,
  reduceAll,
  type Command,
  type CommittedEvent,
  type DomainEvent,
  type EphemeralPayload,
  type Participant,
  type RejectionCode,
  type RoomState,
  type ServerMessage,
} from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";

/** A connected socket bound to a participant. */
export interface RoomClient {
  participantId: string;
  /** Reliable, ordered delivery: snapshots, committed events, acks. */
  send(message: ServerMessage): void;
  /**
   * Best-effort delivery for the ephemeral channel — dropped under backpressure so
   * pointer chatter never queues ahead of committed state (DESIGN.md §2.2, FR-SYNC-03).
   * Falls back to `send` for transports without a volatile path.
   */
  sendVolatile?(message: ServerMessage): void;
}

export type SubmitResult =
  | { ok: true; seq: number | null }
  | { ok: false; code: RejectionCode; message: string };

/**
 * One loaded room: authoritative state + connected clients.
 *
 * Every committed change goes through `runExclusive`, a per-room FIFO queue, so commands
 * are decided against the latest state and receive consecutive seqs (FR-SYNC-01/04).
 */
export class LiveRoom {
  private state: RoomState;
  private seq: number;
  private clients = new Set<RoomClient>();
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(
    readonly roomId: string,
    private store: RoomStore,
    events: CommittedEvent[],
  ) {
    this.state = reduceAll(emptyRoomState(roomId), events.map((e) => e.event));
    this.seq = events.at(-1)?.seq ?? 0;
  }

  static async load(roomId: string, store: RoomStore) {
    return new LiveRoom(roomId, store, await store.loadEvents(roomId));
  }

  participant(id: string): Participant | undefined {
    return this.state.participants[id];
  }

  /** Validate, authorize, persist, apply, broadcast. */
  submit(actorId: string, command: Command): Promise<SubmitResult> {
    return this.runExclusive(async () => {
      const actor = this.state.participants[actorId];
      if (!actor) return { ok: false, code: "forbidden", message: "Unknown participant" };
      const decision = decide(this.state, actor, command, { newId: randomUUID });
      if (!decision.ok) return decision;
      const committed = await this.commit(actorId, decision.events);
      return { ok: true, seq: committed.at(-1)?.seq ?? null };
    });
  }

  /** For server-originated events (room creation, joins) that aren't client commands. */
  appendSystem(actorId: string | null, events: DomainEvent[]) {
    return this.runExclusive(() => this.commit(actorId, events));
  }

  attach(client: RoomClient) {
    this.clients.add(client);
    this.sendSnapshot(client);
  }

  detach(client: RoomClient) {
    this.clients.delete(client);
  }

  get clientCount() {
    return this.clients.size;
  }

  /** Full filtered state (FR-PL-06). Used on connect, on request, and when filtering needs it. */
  sendSnapshot(client: RoomClient) {
    const viewer = this.state.participants[client.participantId];
    if (!viewer) return;
    client.send({
      type: "welcome",
      you: viewer,
      seq: this.seq,
      state: filterStateForViewer(this.state, viewer),
    });
  }

  /** Ephemeral channel (FR-SYNC-03): relayed to other clients, never persisted, no seq. */
  relayEphemeral(from: RoomClient, payload: EphemeralPayload) {
    const sender = this.state.participants[from.participantId];
    if (!sender) return;
    let token = undefined;
    if (payload.type === "tokenDragPreview") {
      token = this.state.tokens[payload.tokenId];
      if (!token || !can.moveToken(sender, token)) return;
    }
    for (const client of this.clients) {
      if (client === from) continue;
      const viewer = this.state.participants[client.participantId];
      if (!viewer) continue;
      if (token?.hidden && viewer.role !== "gm") continue;
      const deliver = client.sendVolatile ?? client.send;
      deliver.call(client, { type: "ephemeral", from: sender.id, payload });
    }
  }

  private async commit(actorId: string | null, events: DomainEvent[]) {
    if (events.length === 0) return [];
    const committed = await this.store.append(
      this.roomId,
      this.seq,
      events.map((event) => ({ actorId, event })),
    );
    for (const c of committed) {
      const before = this.state;
      this.state = reduce(this.state, c.event);
      this.seq = c.seq;
      this.broadcast(c, before);
    }
    return committed;
  }

  private broadcast(committed: CommittedEvent, before: RoomState) {
    for (const client of this.clients) {
      const viewer = this.state.participants[client.participantId];
      if (!viewer) continue;
      const filtered = filterEventForViewer(committed, before, viewer);
      switch (filtered.kind) {
        case "event":
          client.send({ type: "event", committed: filtered.committed });
          break;
        case "redacted":
          client.send({ type: "redacted", seq: filtered.seq });
          break;
        case "resync":
          this.sendSnapshot(client);
          break;
      }
    }
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

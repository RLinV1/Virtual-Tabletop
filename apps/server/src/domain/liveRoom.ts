import { randomInt, randomUUID } from "node:crypto";
import {
  can,
  decide,
  decideJoin,
  emptyRoomState,
  filterEventForViewer,
  endReason,
  filterStateForViewer,
  isActive,
  reduce,
  reduceAll,
  referencedAssetIds,
  type Command,
  type CommittedEvent,
  type DomainEvent,
  type EphemeralPayload,
  type JoinDecision,
  type Participant,
  type RejectionCode,
  type RoomState,
  type ServerMessage,
  type SessionEndReason,
} from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";

/**
 * Float in [0, 1) from the CSPRNG. A dice roll decides encounter outcomes, so it should not
 * be predictable from other rolls the way `Math.random` is.
 */
const secureRandom = () => randomInt(0, 2 ** 31) / 2 ** 31;

/** A connected socket bound to a participant. */
export interface RoomClient {
  participantId: string;
  /** Reliable, ordered delivery: snapshots, committed events, acks. */
  send(message: ServerMessage): void;
  /**
   * Best-effort delivery for the ephemeral channel — dropped under backpressure so
   * pointer chatter never queues ahead of committed state (DESIGN.md §1, FR-SYNC-03).
   * Falls back to `send` for transports without a volatile path.
   */
  sendVolatile?(message: ServerMessage): void;
  /** Disconnects this client for good, after its seat has ended (ADR 0006). */
  close(): void;
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
  /** Sorted asset ids last written to the reference index, as a comparable key. */
  private assetRefsKey: string | null = null;

  private constructor(
    readonly roomId: string,
    private store: RoomStore,
    events: CommittedEvent[],
  ) {
    this.state = reduceAll(emptyRoomState(roomId), events.map((e) => e.event));
    this.seq = events.at(-1)?.seq ?? 0;
  }

  /** Replays the room's log, then heals the derived projections: the asset index and removed players' credential locks. */
  static async load(roomId: string, store: RoomStore) {
    const room = new LiveRoom(roomId, store, await store.loadEvents(roomId));
    // Heals an index left stale by a crash between append and projection (ADR 0004).
    await room.syncAssetRefs();
    // Same for the credential-row lock on removed participants (FR-GM-20). Idempotent.
    for (const p of Object.values(room.state.participants)) {
      if (p.revoked) await room.revokeCredentials(p.id);
    }
    return room;
  }

  participant(id: string): Participant | undefined {
    return this.state.participants[id];
  }

  /** Why this participant's seat ended, or null if they are still in the room (ADR 0006). */
  endReason(id: string): SessionEndReason | null {
    const p = this.state.participants[id];
    return p ? endReason(p) : null;
  }

  /** The participant, only while they are still in the room (ADR 0006). */
  activeParticipant(id: string): Participant | undefined {
    const p = this.state.participants[id];
    return p && isActive(p) ? p : undefined;
  }

  /** Validate, authorize, persist, apply, broadcast. */
  submit(actorId: string, command: Command): Promise<SubmitResult> {
    return this.runExclusive(async () => {
      const actor = this.state.participants[actorId];
      if (!actor) return { ok: false, code: "forbidden", message: "Unknown participant" };
      // Checked inside the queue, so a command sent from another tab just before the leave
      // committed can't run after it (ADR 0006).
      if (!isActive(actor)) return { ok: false, code: "forbidden", message: "You are no longer in this room" };
      // Randomness is injected, never reached for inside `decide` — that is what keeps the
      // kernel pure and the dice testable (CLAUDE.md invariant 2).
      const decision = decide(this.state, actor, command, { newId: randomUUID, random: secureRandom });
      if (!decision.ok) return decision;
      const committed = await this.commit(actorId, decision.events);
      return { ok: true, seq: committed.at(-1)?.seq ?? null };
    });
  }

  /**
   * Guest join (FR-PL-01). Decided and committed in one queue step, so two joins racing for
   * the same display name can't both pass the uniqueness check (KAN-61).
   */
  join(participant: Participant): Promise<JoinDecision> {
    return this.runExclusive(async () => {
      const decision = decideJoin(this.state, participant);
      if (decision.ok) await this.commit(participant.id, decision.events);
      return decision;
    });
  }

  /** For server-originated events (room creation) that aren't client commands. */
  appendSystem(actorId: string | null, events: DomainEvent[]) {
    return this.runExclusive(() => this.commit(actorId, events));
  }

  /** Binds a connected socket to the room and sends it a snapshot, unless its seat has already ended. */
  attach(client: RoomClient) {
    // The handshake checked this too, but Socket.IO runs the connection handler a tick
    // later; a leave committed in between must not let this socket in (ADR 0006).
    const ended = this.endReason(client.participantId);
    if (ended) {
      client.send({ type: "sessionEnded", reason: ended });
      client.close();
      return;
    }
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
    if (!viewer || !isActive(viewer)) return;
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
    if (!sender || !isActive(sender)) return;
    let token = undefined;
    if (payload.type === "tokenDragPreview") {
      token = this.state.tokens[payload.tokenId];
      if (!token || !can.moveToken(sender, token)) return;
    }
    for (const client of this.clients) {
      if (client === from) continue;
      const viewer = this.state.participants[client.participantId];
      if (!viewer || !isActive(viewer)) continue;
      if (token?.hidden && viewer.role !== "gm") continue;
      const deliver = client.sendVolatile ?? client.send;
      deliver.call(client, { type: "ephemeral", from: sender.id, payload });
    }
  }

  /** Appends events atomically, then reduces, broadcasts and ends any seats they close, in seq order. */
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
      if (c.event.type === "ParticipantLeft") this.endSession(c.event.participant.id, "left");
      if (c.event.type === "ParticipantRevoked") this.endSession(c.event.participant.id, "revoked");
    }
    for (const c of committed) {
      // Not awaited: the committed event and the state gate are the authority, and a slow
      // database must not hold up every other command in the room (sync review).
      if (c.event.type === "ParticipantRevoked") void this.revokeCredentials(c.event.participant.id);
    }
    await this.syncAssetRefs();
    return committed;
  }

  /**
   * Keeps the library's "in use" index in step with current state (ADR 0004). A read
   * model: derived from RoomState, never read back into it. The events are already
   * committed by now, so a failure here is logged rather than failing the command; the
   * next load rewrites the index.
   */
  private async syncAssetRefs() {
    const ids = [...referencedAssetIds(this.state)].sort();
    const key = ids.join("\n");
    if (key === this.assetRefsKey) return;
    try {
      await this.store.setAssetRefs(this.roomId, ids);
      this.assetRefsKey = key;
    } catch (err) {
      console.error(`[vtt] could not update asset refs for room ${this.roomId}`, err);
    }
  }

  /**
   * The credential rows' second lock for a removal (FR-GM-20, ADR 0006). The event is already
   * committed and is the authority, so a failure is logged, not surfaced: the state gate holds.
   */
  private async revokeCredentials(participantId: string) {
    try {
      await this.store.revokeCredentials(this.roomId, participantId);
    } catch (err) {
      console.error(`[vtt] could not revoke credentials for ${participantId} in room ${this.roomId}`, err);
    }
  }

  /**
   * Ends every connection bound to a participant who is no longer in the room: all their
   * tabs and devices, not just the one that asked (ADR 0006).
   */
  private endSession(participantId: string, reason: SessionEndReason) {
    for (const client of [...this.clients]) {
      if (client.participantId !== participantId) continue;
      this.clients.delete(client);
      client.send({ type: "sessionEnded", reason });
      client.close();
    }
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

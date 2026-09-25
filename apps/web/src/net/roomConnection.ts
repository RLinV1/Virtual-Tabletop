import { io, type Socket } from "socket.io-client";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  SOCKET_EVENTS,
  reduce,
  type ClientMessageInput,
  type CommandInput,
  type EphemeralPayload,
  type Participant,
  type RoomState,
  type ServerMessage,
} from "@vtt/shared";

/** `ended`: this seat left the room (ADR 0006). Terminal, like `unauthorized`: never reconnects. */
export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "unauthorized" | "ended";

export interface RoomSnapshot {
  status: ConnectionStatus;
  state: RoomState | null;
  you: Participant | null;
  seq: number;
}

export type CommandResult =
  | { ok: true; seq: number | null }
  | { ok: false; code: string; message: string };

type EphemeralListener = (from: string, payload: EphemeralPayload) => void;

/**
 * Client side of the sync protocol (docs/adr/0001-event-model.md, docs/adr/0002).
 *  - Never changes state except through `reduce` on a server event, or a server snapshot.
 *  - Applies events only in seq order; any gap or reducer error triggers a resync.
 *  - Socket.IO owns reconnection and backoff (FR-PL-05). Credentials ride the handshake,
 *    so a reconnect rebinds to the same participant and the server replies with a full
 *    filtered snapshot (FR-PL-06) — there is no client-side catch-up to get wrong.
 *
 * Observable state lives in a Zustand store (DESIGN.md §2) so components subscribe to
 * exactly the slice they render.
 */
export class RoomConnection {
  private socket: Socket | null = null;
  private nextCommandId = 0;
  private pending = new Map<string, (r: CommandResult) => void>();
  private ephemeralListeners = new Set<EphemeralListener>();

  readonly store: StoreApi<RoomSnapshot> = createStore<RoomSnapshot>(() => ({
    status: "connecting",
    state: null,
    you: null,
    seq: 0,
  }));

  constructor(
    private roomId: string,
    private guestToken: string,
  ) {}

  get snapshot(): RoomSnapshot {
    return this.store.getState();
  }

  /** Opens the socket with this seat's credential and wires up message and connection handling. */
  start() {
    const socket = io({
      path: "/socket.io",
      transports: ["websocket"],
      auth: { roomId: this.roomId, guestToken: this.guestToken },
    });
    this.socket = socket;

    socket.on(SOCKET_EVENTS.event, (msg: ServerMessage) => this.handle(msg));
    socket.on("disconnect", () => {
      this.failPending("Connection lost");
      if (!this.isTerminal()) this.update({ status: "reconnecting" });
    });
    // A handshake rejection is terminal: the credential is wrong, so retrying cannot help.
    socket.on("connect_error", (err: Error) => {
      if (err.message === "unauthorized" || err.message === "not_found") {
        socket.disconnect();
        this.update({ status: "unauthorized" });
      } else if (err.message === "left") {
        socket.disconnect();
        this.update({ status: "ended" });
      }
    });
  }

  stop() {
    this.socket?.disconnect();
    this.socket = null;
    this.failPending("Disconnected");
  }

  onEphemeral(fn: EphemeralListener) {
    this.ephemeralListeners.add(fn);
    return () => this.ephemeralListeners.delete(fn);
  }

  command(command: CommandInput): Promise<CommandResult> {
    if (this.snapshot.status !== "open") {
      return Promise.resolve({ ok: false, code: "offline", message: "Not connected" });
    }
    const clientCommandId = `c${++this.nextCommandId}`;
    return new Promise((resolve) => {
      this.pending.set(clientCommandId, resolve);
      this.send({ type: "command", clientCommandId, command });
    });
  }

  ephemeral(payload: EphemeralPayload) {
    if (this.snapshot.status === "open") this.send({ type: "ephemeral", payload });
  }

  /** Applies one server message: snapshots, ordered events, acks, and terminal session ends. */
  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        this.update({ status: "open", state: msg.state, you: msg.you, seq: msg.seq });
        return;

      case "event": {
        const { state, seq } = this.snapshot;
        if (!state || msg.committed.seq !== seq + 1) return this.resync();
        try {
          const next = reduce(state, msg.committed.event);
          const you = this.snapshot.you ? (next.participants[this.snapshot.you.id] ?? null) : null;
          this.update({ state: next, seq: msg.committed.seq, you });
        } catch {
          this.resync();
        }
        return;
      }

      case "redacted":
        if (msg.seq !== this.snapshot.seq + 1) return this.resync();
        this.update({ seq: msg.seq });
        return;

      case "ack":
        this.settle(msg.clientCommandId, { ok: true, seq: msg.seq });
        return;

      case "rejected":
        this.settle(msg.clientCommandId, { ok: false, code: msg.code, message: msg.message });
        return;

      case "ephemeral":
        this.ephemeralListeners.forEach((fn) => fn(msg.from, msg.payload));
        return;

      case "sessionEnded":
        // Every tab of this seat gets this, not only the one that clicked Leave. The server
        // disconnects next; stop here so Socket.IO doesn't try to reconnect (ADR 0006).
        this.update({ status: "ended" });
        // Before disconnecting: the disconnect listener would fail them as "Connection lost".
        this.failPending("You left this room");
        this.socket?.disconnect();
        return;

      case "error":
        if (msg.code === "unauthorized" || msg.code === "not_found") {
          this.update({ status: "unauthorized" });
        }
        console.warn("Server error:", msg.message);
        return;
    }
  }

  /** True once the connection can never recover: no access, or this seat has ended. */
  private isTerminal() {
    const { status } = this.snapshot;
    return status === "unauthorized" || status === "ended";
  }

  private resync() {
    this.send({ type: "resync" });
  }

  private send(msg: ClientMessageInput) {
    this.socket?.emit(SOCKET_EVENTS.message, msg);
  }

  private settle(id: string, result: CommandResult) {
    this.pending.get(id)?.(result);
    this.pending.delete(id);
  }

  private failPending(message: string) {
    for (const resolve of this.pending.values()) resolve({ ok: false, code: "offline", message });
    this.pending.clear();
  }

  private update(patch: Partial<RoomSnapshot>) {
    this.store.setState(patch);
  }
}

/** Subscribe a component to the room's Zustand store. */
export function useRoomSnapshot(connection: RoomConnection): RoomSnapshot {
  return useStore(connection.store);
}

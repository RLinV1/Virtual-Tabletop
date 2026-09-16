import {
  reduce,
  type ClientMessageInput,
  type CommandInput,
  type EphemeralPayload,
  type Participant,
  type RoomState,
  type ServerMessage,
} from "@vtt/shared";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "unauthorized";

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
 * Client side of the sync protocol (docs/adr/0001-event-model.md).
 *  - Never changes state except through `reduce` on a server event, or a server snapshot.
 *  - Applies events only in seq order; any gap or reducer error triggers a resync.
 *  - Reconnects automatically with backoff (FR-PL-05) and re-sends `hello`, which returns
 *    a full filtered snapshot (FR-PL-06).
 */
export class RoomConnection {
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private nextCommandId = 0;
  private pending = new Map<string, (r: CommandResult) => void>();
  private listeners = new Set<() => void>();
  private ephemeralListeners = new Set<EphemeralListener>();

  snapshot: RoomSnapshot = { status: "connecting", state: null, you: null, seq: 0 };

  constructor(
    private roomId: string,
    private token: string,
  ) {}

  start() {
    this.stopped = false;
    window.addEventListener("online", this.reconnectNow);
    document.addEventListener("visibilitychange", this.reconnectNow);
    this.connect();
  }

  stop() {
    this.stopped = true;
    window.removeEventListener("online", this.reconnectNow);
    document.removeEventListener("visibilitychange", this.reconnectNow);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.failPending("Disconnected");
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

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

  private connect() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => this.send({ type: "hello", roomId: this.roomId, token: this.token });
    ws.onmessage = (e) => this.handle(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending("Connection lost");
      if (this.stopped || this.snapshot.status === "unauthorized") return;
      this.update({ status: "reconnecting" });
      const delay = Math.min(5000, 250 * 2 ** this.attempt++) * (0.75 + Math.random() * 0.5);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private reconnectNow = () => {
    if (this.stopped || this.ws || document.visibilityState === "hidden") return;
    if (this.snapshot.status !== "reconnecting") return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.connect();
  };

  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        this.attempt = 0;
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

      case "error":
        if (msg.code === "unauthorized" || msg.code === "not_found") {
          this.update({ status: "unauthorized" });
        }
        console.warn("Server error:", msg.message);
        return;
    }
  }

  private resync() {
    this.send({ type: "resync" });
  }

  private send(msg: ClientMessageInput) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
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
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}

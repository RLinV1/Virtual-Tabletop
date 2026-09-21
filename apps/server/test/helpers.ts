import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  emptyRoomState,
  reduce,
  type ClientMessageInput,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type RoomState,
  type ServerMessage,
} from "@vtt/shared";
import { buildApp } from "../src/app";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

export async function startServer() {
  const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
  const app = await buildApp({ store: new MemoryRoomStore(), uploadDir, clientOrigin: "*" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  const base = `http://127.0.0.1:${addr.port}`;

  const post = async <T>(url: string, body: unknown): Promise<T> => {
    const res = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  return {
    base,
    close: () => app.close(),
    /** Mirrors the browser: the client generates its own credential (DESIGN.md §5.1). */
    newGuestToken,
    createRoom: async (displayName = "GM") => {
      const guestToken = newGuestToken();
      const room = await post<CreateRoomResponse>("/api/rooms", {
        roomName: "Test",
        displayName,
        guestToken,
      });
      return { ...room, guestToken };
    },
    join: async (inviteCode: string, displayName: string) => {
      const guestToken = newGuestToken();
      const joined = await post<JoinRoomResponse>(`/api/invites/${inviteCode}/join`, {
        displayName,
        guestToken,
      });
      return { ...joined, guestToken };
    },
    connect: (creds: TestCredentials) => TestClient.connect(base, creds),
  };
}

/** 32 bytes of entropy, as the browser produces in apps/web/src/net/identity.ts. */
export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface TestCredentials {
  roomId: string;
  guestToken: string;
}

/** Mirrors what the browser client does: snapshot + ordered events through the shared reducer. */
export class TestClient {
  state: RoomState = emptyRoomState("");
  seq = 0;
  participantId = "";
  /** Every raw payload ever received, for leak assertions. */
  readonly rawLog: string[] = [];
  private inbox: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  private nextId = 0;

  private constructor(private socket: Socket) {
    socket.on(SOCKET_EVENTS.event, (msg: ServerMessage) => {
      this.rawLog.push(JSON.stringify(msg));
      this.apply(msg);
      this.inbox.push(msg);
      this.waiters.splice(0).forEach((w) => w());
    });
  }

  /** Identity travels in the handshake, so a reconnect rebinds with no extra round trip. */
  static async connect(base: string, creds: TestCredentials) {
    const socket = io(base, {
      transports: ["websocket"],
      auth: { roomId: creds.roomId, guestToken: creds.guestToken },
      reconnection: false,
    });
    // Subscribe before the handshake completes: the server sends `welcome` the moment
    // it accepts the connection, and an event with no listener yet is simply dropped.
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", (err: Error) => reject(new Error(err.message)));
    });
    const reply = await client.waitFor((m) => m.type === "welcome" || m.type === "error");
    if (reply.type === "error") throw new Error(`${reply.code}: ${reply.message}`);
    return client;
  }

  send(msg: ClientMessageInput) {
    this.socket.emit(SOCKET_EVENTS.message, msg);
  }

  /** Send a command and resolve with its ack or rejection. */
  async command(command: Extract<ClientMessageInput, { type: "command" }>["command"]) {
    const clientCommandId = `c${++this.nextId}`;
    this.send({ type: "command", clientCommandId, command });
    return this.waitFor(
      (m): m is Extract<ServerMessage, { type: "ack" | "rejected" }> =>
        (m.type === "ack" || m.type === "rejected") && m.clientCommandId === clientCommandId,
    );
  }

  /** Resolves with the first message (already received or future) matching the predicate, consuming it. */
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs?: number): Promise<T>;
  async waitFor(pred: (m: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  async waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex(pred);
      if (i >= 0) return this.inbox.splice(i, 1)[0]!;
      await this.nextMessage(deadline, "Timed out waiting for message");
    }
  }

  /** Wait until this client has applied everything up to `seq`. */
  async waitForSeq(seq: number, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (this.seq < seq) {
      await this.nextMessage(deadline, `Client stuck at seq ${this.seq}, wanted ${seq}`);
    }
  }

  private nextMessage(deadline: number, timeoutMessage: string) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(new Error(timeoutMessage));
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, remaining);
      this.waiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  close() {
    this.socket.close();
  }

  private apply(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome":
        this.state = msg.state;
        this.seq = msg.seq;
        this.participantId = msg.you.id;
        break;
      case "event":
        if (msg.committed.seq !== this.seq + 1) throw new Error(`Gap: have ${this.seq}, got ${msg.committed.seq}`);
        this.state = reduce(this.state, msg.committed.event);
        this.seq = msg.committed.seq;
        break;
      case "redacted":
        if (msg.seq !== this.seq + 1) throw new Error(`Gap: have ${this.seq}, got ${msg.seq}`);
        this.seq = msg.seq;
        break;
    }
  }
}

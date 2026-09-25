import type { Server as SocketIOServer, Socket } from "socket.io";
import {
  ClientMessage,
  HandshakeAuth,
  SOCKET_EVENTS,
  type ServerMessage,
} from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LiveRoom, RoomClient } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { RoomStore } from "../store/roomStore";

const EPHEMERAL_PER_SECOND = 40;

/**
 * Socket.IO gateway (DESIGN.md §1, §2).
 *
 * Identity is resolved once, in the handshake: Socket.IO replays `auth` on every
 * automatic reconnect, so a dropped client rebinds to the same participant without a
 * round trip (FR-PL-05). Ephemeral traffic is relayed with `volatile.emit` in
 * `LiveRoom`, so pointer and drag chatter drops under backpressure rather than
 * queueing ahead of committed events (FR-SYNC-03).
 */
export function registerSocket(
  io: SocketIOServer,
  deps: { store: RoomStore; registry: RoomRegistry; logger?: boolean },
) {
  // Authenticate during the handshake so an unauthorized socket never reaches a room.
  io.use(async (socket, next) => {
    const auth = HandshakeAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error("bad_request"));

    const cred = await deps.store.findCredential(hashToken(auth.data.guestToken));
    if (!cred || cred.roomId !== auth.data.roomId) return next(new Error("unauthorized"));

    const room = await deps.registry.get(cred.roomId);
    if (!room) return next(new Error("not_found"));
    // A seat that has ended stays ended: the credential is refused, not rebound (ADR 0006).
    if (!room.activeParticipant(cred.participantId)) return next(new Error("left"));

    socket.data.room = room;
    socket.data.participantId = cred.participantId;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const room = socket.data.room as LiveRoom;
    const participantId = socket.data.participantId as string;

    const send = (msg: ServerMessage) => socket.emit(SOCKET_EVENTS.event, msg);
    const client: RoomClient = {
      participantId,
      send,
      sendVolatile: (msg) => socket.volatile.emit(SOCKET_EVENTS.event, msg),
      close: () => socket.disconnect(true),
    };

    // FR-PL-06: every connection starts from an authoritative, filtered snapshot.
    room.attach(client);

    let windowStart = Date.now();
    let ephemeralCount = 0;

    // Handle one message at a time so a socket's messages commit in the order sent.
    let queue: Promise<void> = Promise.resolve();
    socket.on(SOCKET_EVENTS.message, (raw: unknown) => {
      queue = queue.then(async () => void (await handle(raw))).catch((err) => {
        if (deps.logger) console.error("[vtt]", err);
        send({ type: "error", code: "bad_request", message: "Internal error" });
      });
    });

    const handle = async (raw: unknown) => {
      const parsed = ClientMessage.safeParse(raw);
      if (!parsed.success) {
        return send({ type: "error", code: "bad_request", message: parsed.error.message });
      }
      const msg = parsed.data;

      switch (msg.type) {
        case "command": {
          const result = await room.submit(participantId, msg.command);
          if (result.ok) send({ type: "ack", clientCommandId: msg.clientCommandId, seq: result.seq });
          else send({ type: "rejected", clientCommandId: msg.clientCommandId, code: result.code, message: result.message });
          return;
        }
        case "ephemeral": {
          const now = Date.now();
          if (now - windowStart >= 1000) {
            windowStart = now;
            ephemeralCount = 0;
          }
          if (++ephemeralCount > EPHEMERAL_PER_SECOND) return;
          room.relayEphemeral(client, msg.payload);
          return;
        }
        case "resync":
          room.sendSnapshot(client);
          return;
      }
    };

    socket.on("disconnect", () => {
      room.detach(client);
    });
  });
}

import type { FastifyInstance } from "fastify";
import type { RawData, WebSocket } from "ws";
import { ClientMessage, type ServerMessage } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LiveRoom, RoomClient } from "../domain/liveRoom";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { RoomStore } from "../store/roomStore";

const EPHEMERAL_PER_SECOND = 40;

export function registerSocket(
  app: FastifyInstance,
  deps: { store: RoomStore; registry: RoomRegistry },
) {
  app.get("/ws", { websocket: true }, (socket: WebSocket) => {
    let room: LiveRoom | null = null;
    let client: RoomClient | null = null;
    let windowStart = Date.now();
    let ephemeralCount = 0;

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };

    // Handle one message at a time so a socket's messages are processed in the order sent.
    let queue: Promise<void> = Promise.resolve();
    socket.on("message", (raw) => {
      queue = queue.then(() => handle(raw)).catch((err) => {
        app.log.error(err);
        send({ type: "error", code: "bad_request", message: "Internal error" });
      });
    });

    const handle = async (raw: RawData) => {
      let parsed;
      try {
        parsed = ClientMessage.safeParse(JSON.parse(raw.toString()));
      } catch {
        return send({ type: "error", code: "bad_request", message: "Invalid JSON" });
      }
      if (!parsed.success) {
        return send({ type: "error", code: "bad_request", message: parsed.error.message });
      }
      const msg = parsed.data;

      if (msg.type === "hello") {
        if (client) return send({ type: "error", code: "bad_request", message: "Already joined" });
        const cred = await deps.store.findCredential(hashToken(msg.token));
        if (!cred || cred.roomId !== msg.roomId) {
          send({ type: "error", code: "unauthorized", message: "Invalid room credentials" });
          return socket.close(4001, "unauthorized");
        }
        room = await deps.registry.get(cred.roomId);
        if (!room) {
          send({ type: "error", code: "not_found", message: "Room not found" });
          return socket.close(4004, "not_found");
        }
        client = { participantId: cred.participantId, send };
        room.attach(client);
        return;
      }

      if (!room || !client) {
        send({ type: "error", code: "unauthorized", message: "Send hello first" });
        return socket.close(4001, "unauthorized");
      }

      switch (msg.type) {
        case "command": {
          const result = await room.submit(client.participantId, msg.command);
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

    socket.on("close", () => {
      if (room && client) room.detach(client);
    });
  });
}

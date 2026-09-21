import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  CreateRoomRequest,
  JoinRoomRequest,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type UploadResponse,
} from "@vtt/shared";
import { hashToken, newInviteCode, newSecretToken } from "../domain/credentials";
import type { RoomRegistry } from "../domain/roomRegistry";
import type { RoomStore } from "../store/roomStore";

const IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function registerRoutes(
  app: FastifyInstance,
  deps: { store: RoomStore; registry: RoomRegistry; uploadDir: string },
) {
  const { store, registry, uploadDir } = deps;

  // `/health` is what CI's smoke test and DESIGN.md §9 use; `/api/health` is reachable through the Vite proxy.
  const health = async () => ({ ok: true });
  app.get("/health", health);
  app.get("/api/health", health);

  /**
   * Create a room; the caller becomes its GM.
   * TODO(FR-GM-01): require an authenticated GM account. For now anyone may create a room
   * and the returned token is the GM's credential.
   */
  app.post("/api/rooms", async (req, reply): Promise<CreateRoomResponse | void> => {
    const body = CreateRoomRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues });

    const roomId = randomUUID();
    const inviteCode = newInviteCode();
    const participantId = randomUUID();
    const token = newSecretToken();

    await store.createRoom(roomId, inviteCode);
    await store.saveCredential(hashToken(token), { roomId, participantId });
    const room = await registry.get(roomId);
    await room!.appendSystem(participantId, [
      { type: "RoomCreated", name: body.data.roomName },
      {
        type: "ParticipantJoined",
        participant: { id: participantId, role: "gm", displayName: body.data.displayName },
      },
    ]);
    return { roomId, inviteCode, participantId, token };
  });

  /** Guest join from a shareable link (FR-PL-01). No account. */
  app.post<{ Params: { inviteCode: string } }>(
    "/api/invites/:inviteCode/join",
    async (req, reply): Promise<JoinRoomResponse | void> => {
      const body = JoinRoomRequest.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: body.error.issues });
      const roomId = await store.findRoomByInvite(req.params.inviteCode);
      const room = roomId ? await registry.get(roomId) : null;
      if (!roomId || !room) return reply.code(404).send({ error: "Invite not found" });

      const participantId = randomUUID();
      const token = newSecretToken();
      await store.saveCredential(hashToken(token), { roomId, participantId });
      await room.appendSystem(participantId, [
        {
          type: "ParticipantJoined",
          participant: { id: participantId, role: "player", displayName: body.data.displayName },
        },
      ]);
      return { roomId, participantId, token };
    },
  );

  /** Image upload for maps/tokens. GM only. TODO: move to object storage (MinIO/S3). */
  app.post("/api/uploads", async (req, reply): Promise<UploadResponse | void> => {
    const actor = await authenticate(req);
    if (!actor || actor.role !== "gm") return reply.code(403).send({ error: "GM only" });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file" });
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) return reply.code(415).send({ error: "Use PNG, JPEG or WebP" });

    await mkdir(uploadDir, { recursive: true });
    const name = `${randomUUID()}${ext}`;
    await pipeline(file.file, createWriteStream(path.join(uploadDir, name)));
    if (file.file.truncated) return reply.code(413).send({ error: "File too large" });
    return { url: `/uploads/${name}` };
  });

  async function authenticate(req: FastifyRequest) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const cred = await store.findCredential(hashToken(header.slice(7)));
    if (!cred) return null;
    const room = await registry.get(cred.roomId);
    return room?.participant(cred.participantId) ?? null;
  }
}

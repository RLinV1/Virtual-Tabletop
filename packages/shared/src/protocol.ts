import { z } from "zod";
import { Command } from "./commands";
import { CommittedEvent } from "./events";
import { Point } from "./geometry";
import { Id, Participant, type RoomState } from "./state";
import type { RejectionCode } from "./decide";

/**
 * WebSocket wire protocol. One socket per client carries two logical channels:
 *  - committed: commands in, ordered events out (persisted, sequenced)
 *  - ephemeral: pings/previews relayed to the room (never persisted, no seq) (FR-SYNC-03)
 */

// ---------- Ephemeral payloads ----------
export const EphemeralPayload = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), at: Point }),
  z.object({ type: z.literal("tokenDragPreview"), tokenId: Id, at: Point }),
]);
export type EphemeralPayload = z.infer<typeof EphemeralPayload>;

// ---------- Client -> Server ----------
export const ClientMessage = z.discriminatedUnion("type", [
  /** First message on every (re)connection. Server replies with `welcome`. */
  z.object({
    type: z.literal("hello"),
    roomId: Id,
    /** Opaque credential from room creation or join; kept in localStorage (FR-PL-02). */
    token: z.string().min(16).max(256),
  }),
  z.object({
    type: z.literal("command"),
    /** Client-chosen id so the client can match the ack/rejection. */
    clientCommandId: z.string().min(1).max(64),
    command: Command,
  }),
  z.object({
    type: z.literal("ephemeral"),
    payload: EphemeralPayload,
  }),
  /** Client detected a seq gap or a reducer error; server replies with a fresh `welcome`. */
  z.object({ type: z.literal("resync") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;
export type ClientMessageInput = z.input<typeof ClientMessage>;

// ---------- Server -> Client ----------
export type ServerMessage =
  /** Full, filtered snapshot. Client replaces its state and sets lastSeq = seq (FR-PL-06). */
  | { type: "welcome"; you: Participant; seq: number; state: RoomState }
  /** Next committed event. Client applies iff seq === lastSeq + 1, else sends `resync`. */
  | { type: "event"; committed: CommittedEvent }
  /** A seq the viewer may not see. Client advances lastSeq only. */
  | { type: "redacted"; seq: number }
  | { type: "ack"; clientCommandId: string; seq: number | null }
  | { type: "rejected"; clientCommandId: string; code: RejectionCode | "bad_request"; message: string }
  | { type: "ephemeral"; from: Id; payload: EphemeralPayload }
  | { type: "error"; code: "unauthorized" | "bad_request" | "not_found"; message: string };

// ---------- HTTP ----------
export const CreateRoomRequest = z.object({
  roomName: z.string().min(1).max(80),
  displayName: z.string().min(1).max(40),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const JoinRoomRequest = z.object({
  displayName: z.string().min(1).max(40),
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequest>;

export interface RoomCredentials {
  roomId: string;
  participantId: string;
  /** Secret; store in localStorage, send in `hello`. */
  token: string;
}

export interface CreateRoomResponse extends RoomCredentials {
  inviteCode: string;
}

export type JoinRoomResponse = RoomCredentials;

export interface UploadResponse {
  url: string;
}

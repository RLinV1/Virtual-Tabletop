import type { GmRoomSummary } from "@vtt/shared";

/**
 * Which participant a person is in a room (ADR 0017 M1, the membership layer). Access, not game
 * state: kept beside the event log like `credentials`, never sent to any participant, and never
 * read by the room kernel.
 */

export interface MemberRecord {
  roomId: string;
  participantId: string;
  userId: string;
}

/** Why keeping a guest seat on an account was refused (ADR 0017 M3). */
export type KeepSeatConflict = "account_has_seat" | "seat_taken";

export interface MembershipStore {
  /** The account's seat in the room, if it has one. */
  findMember(roomId: string, userId: string): Promise<MemberRecord | null>;
  /** The account that holds this participant's seat, if any. */
  findMemberByParticipant(roomId: string, participantId: string): Promise<MemberRecord | null>;
  /**
   * Keeps a seat on an account: inserts the row, or re-points the account's existing row in
   * that room to `participantId` (a person who left and joined again). The caller decides
   * which is allowed; the store only keeps one row per (room, account).
   */
  putMember(member: MemberRecord): Promise<void>;
  /** Every seat the account holds, in any room. */
  listMemberships(userId: string): Promise<MemberRecord[]>;
  /** Name and last activity of these rooms, most recently active first; missing ids are skipped. */
  summarizeRooms(roomIds: string[]): Promise<GmRoomSummary[]>;
  /**
   * Keeps a guest seat on the account in one step: the member row, and the credential bound to
   * the session so it follows the device's sign-in (ADR 0017 M3, M4). Refused, changing
   * nothing, when the account already holds a seat in the room or the seat already belongs to
   * an account.
   */
  keepSeat(member: MemberRecord, credentialHash: string, sessionHash: string): Promise<KeepSeatConflict | null>;
}

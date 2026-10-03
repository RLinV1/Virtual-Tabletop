import { api } from "./api";
import { loadCredentials, newGuestToken, saveCredentials, type StoredCredentials } from "./identity";

/**
 * This browser's seat in a room: the one it already holds, or the signed-in account's seat
 * resumed on this device (room-membership, ADR 0017 M2). The new credential is generated here,
 * like a join's; the server keeps only its hash. A GM seat also stores the invite code, which is
 * how the home page tells a GM's seat from a player's (KAN-64).
 *
 * Throws the server's refusal (404 not yours, 403 ended) for the caller to show.
 */
export async function ensureSeat(roomId: string): Promise<StoredCredentials> {
  const stored = loadCredentials(roomId);
  if (stored) return stored;
  const guestToken = newGuestToken();
  const seat = await api.rooms.seat(roomId, guestToken);
  const inviteCode = seat.role === "gm" ? (await api.getInvite(roomId, guestToken).catch(() => null))?.inviteCode : undefined;
  const creds: StoredCredentials = {
    roomId,
    participantId: seat.participantId,
    guestToken,
    viaAccount: true,
    ...(inviteCode && { inviteCode }),
  };
  saveCredentials(creds);
  return creds;
}

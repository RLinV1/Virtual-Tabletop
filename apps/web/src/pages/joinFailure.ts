import { ROOM_FULL } from "@vtt/shared";
import { ApiError } from "../net/api";

/**
 * What the join form shows for a refused join. A full room is not the name's fault, so the name
 * field is not marked as the cause (room-player-cap); every other refusal is shown against it.
 */
export function joinFailure(err: unknown): { message: string; nameIsCause: boolean } {
  return {
    message: err instanceof Error ? err.message : "Could not join",
    nameIsCause: !(err instanceof ApiError && err.detail.code === ROOM_FULL),
  };
}

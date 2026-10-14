import { api } from "../../net/api";
import { newGuestToken, saveCredentials } from "../../net/identity";
import { navigate } from "../../router";

/** Where a temporary encounter-editing room opens (ADR 0033). */
export const encounterEditPath = (roomId: string) => `/encounters/edit/${roomId}`;

/**
 * Opens a template, or a new one on a library map, in a temporary room and goes there. The
 * room's credential is kept like that of any room this browser creates.
 */
export async function startEncounterEdit(from: { templateId: string } | { mapAssetId: string }) {
  const guestToken = newGuestToken();
  const started = await api.library.encounterEdits.start({ ...from, guestToken });
  saveCredentials({ ...started, guestToken, viaAccount: true });
  navigate(encounterEditPath(started.roomId));
}

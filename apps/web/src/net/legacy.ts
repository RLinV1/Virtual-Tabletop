import type { LegacySummary } from "@vtt/shared";
import { api, ApiError } from "./api";
import { forgetGmToken, loadGmToken } from "./identity";

/**
 * What this browser's legacy GM token owns, for the "bring this browser's rooms into your account"
 * offer (gm-dashboard, ADR 0017 O2). Null when there is nothing to offer.
 *
 * A token the server doesn't recognise, or one that owns nothing, is forgotten here: never
 * registered again, never retried, never replaced (gm-identity-recovery). Any other failure keeps
 * it, so a passing outage doesn't lose someone's rooms.
 */
export async function legacyOffer(client: Pick<typeof api, "legacy"> = api): Promise<{ token: string; summary: LegacySummary } | null> {
  const token = loadGmToken();
  if (!token) return null;
  try {
    const summary = await client.legacy.summary(token);
    if (summary.rooms + summary.assets + summary.creatures + summary.diceLooks === 0) {
      forgetGmToken();
      return null;
    }
    return { token, summary };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) forgetGmToken();
    return null;
  }
}

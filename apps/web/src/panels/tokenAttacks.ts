import type { AttackPreset } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";

/**
 * Save a token's named attacks for everyone who may see them (ADR 0034): the GM and the token's
 * owners. Resolves to the server's reason when it refuses, else null.
 */
export async function saveTokenAttacks(connection: Pick<RoomConnection, "command">, tokenId: string, attacks: AttackPreset[]): Promise<string | null> {
  const result = await connection.command({ type: "token.configure", tokenId, changes: { attacks } });
  return result.ok ? null : result.message;
}

/** Where attacks lived when they were kept in one browser; no longer read (shared-token-attacks). */
export const LEGACY_ATTACK_KEYS = ["vtt.attack.presets", "vtt.attack.saved"] as const;

/** Remove attacks kept only in this browser. Storage can be missing or blocked; that's fine. */
export function clearLegacyAttackStorage(storage: Pick<Storage, "removeItem"> | null): void {
  for (const key of LEGACY_ATTACK_KEYS) {
    try {
      storage?.removeItem(key);
    } catch {
      // Blocked storage: nothing was ever saved there to clear.
    }
  }
}

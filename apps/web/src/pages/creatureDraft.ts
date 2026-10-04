import type { ConditionId, LibraryAsset, LibraryCreature, Token, TokenStats } from "@vtt/shared";

/** What "From creature" fills into Add Token (library-creatures, ADR 0012). */
export interface CreatureDraft {
  name: string;
  size: number;
  /** A placed creature starts at full health. */
  stats: TokenStats;
  color: string;
  conditions: ConditionId[];
  /** Null for a creature drawn as a plain colour disc. */
  image: { url: string; assetId: string } | null;
}

export function creatureDraft(creature: LibraryCreature): CreatureDraft {
  return {
    name: creature.name,
    size: creature.size,
    stats: { hp: creature.maxHp, maxHp: creature.maxHp, ac: creature.ac },
    color: creature.color,
    conditions: creature.conditions,
    image: creature.imageUrl && creature.imageAssetId ? { url: creature.imageUrl, assetId: creature.imageAssetId } : null,
  };
}

/** "Size 1 · AC 15 · 7 HP", leaving out what the creature doesn't track. */
export function creatureSummary(creature: Pick<LibraryCreature, "size" | "maxHp" | "ac">): string {
  return [
    `Size ${creature.size}`,
    creature.ac !== null && `AC ${creature.ac}`,
    creature.maxHp !== null && `${creature.maxHp} HP`,
  ].filter(Boolean).join(" · ");
}

/** What Save as creature fills into a new creature form (KAN-70). */
export type CreaturePrefill = Pick<LibraryCreature, "name" | "size" | "maxHp" | "ac" | "color" | "conditions" | "imageAssetId" | "imageUrl">;

/**
 * A token on the board as a new creature's starting values (KAN-70). The image comes along only
 * when it is the GM's own library token art (`ownArt`); built-in art and direct uploads can't be
 * linked to a creature, so the form starts without one.
 */
export function creatureFromToken(token: Token, ownArt: readonly Pick<LibraryAsset, "id" | "url" | "kind">[]): CreaturePrefill {
  const art = token.assetId ? ownArt.find((a) => a.id === token.assetId && a.kind === "token") : undefined;
  return {
    name: token.name,
    size: token.size,
    maxHp: token.stats.maxHp,
    ac: token.stats.ac,
    color: token.color,
    conditions: token.conditions,
    imageAssetId: art?.id ?? null,
    imageUrl: art?.url ?? null,
  };
}

import type { LibraryCreature, TokenStats } from "@vtt/shared";

/** What "From creature" fills into Add Token (library-creatures, ADR 0012). */
export interface CreatureDraft {
  name: string;
  size: number;
  /** A placed creature starts at full health. */
  stats: TokenStats;
  /** Null for a creature drawn as a plain colour disc. */
  image: { url: string; assetId: string } | null;
}

export function creatureDraft(creature: LibraryCreature): CreatureDraft {
  return {
    name: creature.name,
    size: creature.size,
    stats: { hp: creature.maxHp, maxHp: creature.maxHp, ac: creature.ac },
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

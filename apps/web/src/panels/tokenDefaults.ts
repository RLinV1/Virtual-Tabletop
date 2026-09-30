import type { TokenStats } from "@vtt/shared";

/** What Add token uses for a blank HP or AC (token-stat-defaults). Client-side only: the contract still allows null. */
export const DEFAULT_HP = 100;
export const DEFAULT_AC = 0;

/**
 * Fills blank stats on a new token. A blank HP starts at Max HP, and a blank Max HP matches a
 * positive HP, so "HP 30" alone gives 30/30; with both blank the token has 100/100. Blank AC is 0.
 */
export function statsWithDefaults(stats: TokenStats): TokenStats {
  const maxHp = stats.maxHp ?? (stats.hp !== null && stats.hp >= 1 ? stats.hp : DEFAULT_HP);
  return { hp: stats.hp ?? maxHp, maxHp, ac: stats.ac ?? DEFAULT_AC };
}

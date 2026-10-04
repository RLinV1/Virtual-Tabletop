/** How long a ping shows, in ms (FR-TAC-05). Within the spec's 1.5 s. */
export const PING_MS = 1200;

/**
 * A ping's ring at `t` (0 at the ping, 1 at PING_MS), in grid cells, or null once it has
 * expired (KAN-34). It grows as it fades; under reduced motion it keeps one size and only fades.
 */
export function pingPulse(t: number, reducedMotion: boolean): { radiusCells: number; alpha: number } | null {
  if (t >= 1) return null;
  const clamped = Math.max(0, t);
  return {
    radiusCells: reducedMotion ? 0.8 : 0.2 + clamped * 1.2,
    alpha: 1 - clamped,
  };
}

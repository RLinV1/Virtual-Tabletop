import type { AnimationDef } from "@vtt/shared";

/** How long the whole page shakes, as a share of the blast. */
const SHAKE_SHARE = 0.6;
/** Pixels of offset at full `shake`, at the start of the blast. */
const MAX_OFFSET_PX = 22;

/**
 * Shakes the whole page for a nuke (ADR 0038): panels, header and board together, not just the
 * canvas. Pure DOM through the Web Animations API, so it never touches a token or the board's
 * coordinates, and it is gone when the animation ends. Callers skip it under reduced motion.
 * Returns a cancel function.
 */
export function shakeScreen(def: AnimationDef, target: HTMLElement = document.body): () => void {
  if (def.shake <= 0 || typeof target.animate !== "function") return () => {};
  const steps = 18;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Strongest at the blast, easing out; the last frame is exactly at rest.
    const amp = i === steps ? 0 : def.shake * MAX_OFFSET_PX * (1 - t) ** 2;
    const x = Math.sin(i * 2.9) * amp;
    const y = Math.cos(i * 3.7) * amp;
    const tilt = Math.sin(i * 1.7) * amp * 0.04;
    frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)` });
  }
  const animation = target.animate(frames, { duration: def.duration * SHAKE_SHARE * 1000, easing: "linear" });
  return () => animation.cancel();
}

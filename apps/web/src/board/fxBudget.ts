/** Share of a nuke spent showing the falling bomb before impact. */
export const NUKE_DROP_SHARE = 0.22;
/** Heavy effects render at 30 fps, independent of display refresh rate. */
export const FX_FRAME_MS = 1000 / 30;

/** Screen-sized mushroom cloud, independent of map dimensions or zoom. */
export function nukeLayout(width: number, height: number, size: number) {
  const h = Math.max(1, height);
  const strength = Math.min(1.08, 0.76 + size * 0.08);
  const capWidth = Math.min(Math.max(1, width) * 0.7, h * 0.98) * strength;
  const cloudHeight = Math.max(1, Math.min(
    Math.min(h * 0.27, Math.max(1, width) * 0.32) * strength,
    h * 0.48 - capWidth * 0.22,
  ));
  return { origin: { x: width / 2, y: height / 2 }, cloudHeight, capWidth };
}

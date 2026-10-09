/** Smallest name label, in board pixels, so a tiny token's name stays readable. */
export const MIN_LABEL_FONT = 12;
/** Largest name label, so a huge token's name doesn't swamp the map. */
export const MAX_LABEL_FONT = 96;
/** Label height as a share of the token's drawn radius. */
const LABEL_FONT_PER_RADIUS = 0.45;

/**
 * Font size for a token's name label, proportional to its drawn radius (token size times
 * cell size), so the name grows with the token instead of staying a fixed 14px
 * (condense-token-editor).
 */
export function tokenLabelFontSize(radius: number): number {
  return Math.min(MAX_LABEL_FONT, Math.max(MIN_LABEL_FONT, Math.round(radius * LABEL_FONT_PER_RADIUS)));
}

/** Outline width that keeps the same weight relative to the text at any label size. */
export function tokenLabelStroke(fontSize: number): number {
  return Math.max(3, Math.round(fontSize * 0.2));
}

/** Space between the bottom of the name label and the top of the condition markers. */
const MARKER_GAP = 4;

/**
 * Vertical centre of the condition-marker row, below the name label's rendered bottom. The
 * label grows with the token, so a fixed offset from the radius would let the name cover the
 * markers on large tokens. `markerSize` is the marker's half-height.
 */
export function conditionRowY(labelTop: number, labelHeight: number, markerSize: number): number {
  return labelTop + labelHeight + MARKER_GAP + markerSize;
}

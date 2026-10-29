import type { CSSProperties } from "react";

/** How far a slider's orange track fill reaches, as the house range style expects. */
export function rangeFill(value: number, min: number, max: number): CSSProperties {
  return { "--range-progress": `${((value - min) / (max - min)) * 100}%` } as CSSProperties;
}

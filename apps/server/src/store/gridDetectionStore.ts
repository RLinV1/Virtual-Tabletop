import type { GridDetectionCandidate } from "@vtt/shared";

export type DetectionTarget =
  | { scope: "library"; id: string }
  | { scope: "room"; roomId: string; objectKey: string };
export type DetectionState = "queued" | "running" | "suggested" | "no_grid" | "error";
export interface DetectionRecord {
  target: DetectionTarget;
  objectKey: string;
  width: number;
  height: number;
  status: DetectionState;
  attempt: number;
  candidate: GridDetectionCandidate | null;
}
export type DetectionOutcome = { status: "suggested"; candidate: GridDetectionCandidate }
  | { status: "no_grid" | "error" };

/** Analysis metadata never becomes RoomState or a player-visible asset response. */
export interface GridDetectionStore {
  findDetection(target: DetectionTarget): Promise<DetectionRecord | null>;
  markDetectionRunning(target: DetectionTarget, attempt: number): Promise<boolean>;
  finishDetection(target: DetectionTarget, attempt: number, outcome: DetectionOutcome): Promise<boolean>;
  /** Returns the new attempt, or null unless the row is currently in error. */
  retryDetection(target: DetectionTarget): Promise<number | null>;
  /** Requeue pending and stale running jobs. A recovered running job gets a new attempt. */
  recoverDetections(): Promise<Array<{ target: DetectionTarget; attempt: number }>>;
}

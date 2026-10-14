import { z } from "zod";

/** Private HTTP contract. Values are measured against the original image pixels. */
export const GridDetectionCandidate = z.object({
  cellSize: z.number().finite().positive().max(2000),
  offsetX: z.number().finite().nonnegative(),
  offsetY: z.number().finite().nonnegative(),
  confidence: z.number().finite().min(0).max(1),
}).refine((value) => value.offsetX < value.cellSize && value.offsetY < value.cellSize,
  { message: "Offsets must be within one cell" });
export type GridDetectionCandidate = z.infer<typeof GridDetectionCandidate>;

export const GridDetectionStatus = z.discriminatedUnion("status", [
  z.object({ status: z.literal("queued"), attempt: z.number().int().positive() }),
  z.object({ status: z.literal("running"), attempt: z.number().int().positive() }),
  z.object({ status: z.literal("suggested"), attempt: z.number().int().positive(), candidate: GridDetectionCandidate }),
  z.object({ status: z.literal("no_grid"), attempt: z.number().int().positive() }),
  z.object({ status: z.literal("error"), attempt: z.number().int().positive() }),
]);
export type GridDetectionStatus = z.infer<typeof GridDetectionStatus>;

/** Direct room uploads omit purpose for backwards-compatible token callers. */
export const RoomUploadPurpose = z.enum(["map", "token"]);
export type RoomUploadPurpose = z.infer<typeof RoomUploadPurpose>;

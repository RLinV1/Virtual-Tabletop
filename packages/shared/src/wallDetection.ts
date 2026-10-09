import { z } from "zod";
import { Point } from "./geometry";
import { MAX_WALLS } from "./state";

/**
 * Automatic wall detection (FR-GM-11, ADR 0025). A Python worker consumes a BullMQ job and
 * returns these shapes; the app server validates them before the GM sees anything. Nothing
 * here is room state: a result only becomes walls through `wall.applyDetected`.
 */

/** Name of the BullMQ queue the app server produces to and `services/vision/wall_worker.py` consumes. */
export const WALL_DETECTION_QUEUE = "wall-detection";

/** Largest preview image the server accepts from the worker, in bytes after base64 decoding. */
export const MAX_WALL_PREVIEW_BYTES = 2 * 1024 * 1024;

/** One detected segment, in the map image's own pixels. */
export const DetectedWall = z.object({ a: Point, b: Point }).strict();
export type DetectedWall = z.infer<typeof DetectedWall>;

/** What the vision worker returns for one job. */
export const WallDetectionResult = z.object({
  walls: z.array(DetectedWall).max(MAX_WALLS),
  preview: z.object({
    contentType: z.enum(["image/jpeg", "image/png"]),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
    /** Base64 image bytes. */
    data: z.string().min(1).max(Math.ceil(MAX_WALL_PREVIEW_BYTES / 3) * 4),
  }).strict(),
}).strict();
export type WallDetectionResult = z.infer<typeof WallDetectionResult>;

/** Whether every segment lies on a map of this size (the worker works in the same pixels). */
export function wallsFitMap(walls: readonly DetectedWall[], map: { width: number; height: number }): boolean {
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height;
  return walls.every((w) => inside(w.a) && inside(w.b));
}

/** The GM's view of the latest analysis of one map (ADR 0025). Never sent to players. */
export const WallDetectionStatus = z.discriminatedUnion("status", [
  z.object({ status: z.literal("queued") }),
  z.object({ status: z.literal("running") }),
  z.object({
    status: z.literal("done"),
    wallCount: z.number().int().min(0).max(MAX_WALLS),
    /** Size of the preview image. */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  z.object({ status: z.literal("failed"), message: z.string().max(200) }),
]);
export type WallDetectionStatus = z.infer<typeof WallDetectionStatus>;

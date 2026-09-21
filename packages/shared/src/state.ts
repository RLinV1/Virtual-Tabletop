import { z } from "zod";
import { DEFAULT_GRID, GridSpec, Point } from "./geometry";

export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

export const Role = z.enum(["gm", "player"]);
export type Role = z.infer<typeof Role>;

export const Participant = z.object({
  id: Id,
  role: Role,
  displayName: z.string().min(1).max(40),
});
export type Participant = z.infer<typeof Participant>;

export const MapImage = z.object({
  /** Server-relative URL of the uploaded image. */
  url: z.string().min(1).max(2048),
  /** Natural image size in pixels = board size in board coordinates. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type MapImage = z.infer<typeof MapImage>;

export const Scene = z.object({
  map: MapImage.nullable(),
  grid: GridSpec,
});
export type Scene = z.infer<typeof Scene>;

export const Token = z.object({
  id: Id,
  name: z.string().min(1).max(60),
  /** Center of the token in board coordinates. */
  position: Point,
  /** Footprint edge length in grid cells (1 = medium, 2 = large, ...). */
  size: z.number().positive().max(10),
  /** Degrees clockwise. */
  rotation: z.number().finite(),
  /** Hex color used when there is no token image. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  imageUrl: z.string().max(2048).nullable(),
  /** Player participants allowed to move this token (FR-GM-10, FR-PL-04). The GM can always move it. */
  ownerIds: z.array(Id),
  /** Hidden tokens are never sent to player clients (FR-GM-16, FR-GM-23). */
  hidden: z.boolean(),
});
export type Token = z.infer<typeof Token>;

/**
 * The authoritative state of one room. Produced only by folding committed events
 * through `reduce` — never mutated directly.
 */
export interface RoomState {
  roomId: Id;
  name: string;
  scene: Scene;
  tokens: Record<Id, Token>;
  participants: Record<Id, Participant>;
}

export function emptyRoomState(roomId: Id): RoomState {
  return {
    roomId,
    name: "",
    scene: { map: null, grid: DEFAULT_GRID },
    tokens: {},
    participants: {},
  };
}

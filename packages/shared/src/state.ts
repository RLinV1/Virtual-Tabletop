import { z } from "zod";
import { ConditionId, TokenStats } from "./conditions";
import { DiceRoll } from "./dice";
import { DEFAULT_GRID, GridSpec, Point } from "./geometry";

export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

export const Role = z.enum(["gm", "player"]);
export type Role = z.infer<typeof Role>;

export const Participant = z.object({
  id: Id,
  role: Role,
  displayName: z.string().min(1).max(40),
  /**
   * Set once the participant leaves the table (ADR 0006). They stay in state because tokens,
   * rolls and history still name them. Optional so older events and snapshots parse unchanged.
   */
  left: z.boolean().optional(),
  /** Set when the GM removed them (FR-GM-20, ADR 0006). Same rules as `left`; optional for old data. */
  revoked: z.boolean().optional(),
});
export type Participant = z.infer<typeof Participant>;

export const MapImage = z.object({
  /** Server-relative URL of the uploaded image. */
  url: z.string().min(1).max(2048),
  /** Natural image size in pixels = board size in board coordinates. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /**
   * Library asset this map was placed from, if any (ADR 0004). Opaque — it names nothing,
   * and no player-reachable endpoint resolves it. Nullish so older events still parse.
   */
  assetId: Id.nullish(),
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
  /** Library asset the image came from, if any (ADR 0004). */
  assetId: Id.nullish(),
  /** Player participants allowed to move this token (FR-GM-10, FR-PL-04). The GM can always move it. */
  ownerIds: z.array(Id),
  /** Hidden tokens are never sent to player clients (FR-GM-16, FR-GM-23). */
  hidden: z.boolean(),
  /** Numeric resources shown on the token and in the roster (FR-TAC-07). */
  stats: TokenStats,
  /** Status conditions, rendered by shape and abbreviation, never colour alone (FR-TAC-08). */
  conditions: z.array(ConditionId).max(12),
});
export type Token = z.infer<typeof Token>;

/**
 * The authoritative state of one room. Produced only by folding committed events
 * through `reduce` — never mutated directly.
 */
/**
 * Encounter turn order (FR-GM-21). Null when no encounter is running.
 *
 * `order` holds token ids so a renamed or re-owned token keeps its slot. Entries whose
 * token has since been deleted are skipped when advancing rather than rewritten, because
 * the log is append-only and rewriting history is not allowed.
 */
export const Initiative = z.object({
  /** Token ids, highest initiative first. The server sorts; clients never reorder locally. */
  order: z.array(Id).max(60),
  /** Index into `order` whose turn it is. */
  activeIndex: z.number().int().min(0),
  /** Increments each time the turn wraps past the end of the order. */
  round: z.number().int().min(1),
});
export type Initiative = z.infer<typeof Initiative>;

/** How many rolls the log keeps. Older ones stay in the event log, just not in state. */
export const ROLL_LOG_LIMIT = 30;

export interface RoomState {
  roomId: Id;
  name: string;
  scene: Scene;
  tokens: Record<Id, Token>;
  participants: Record<Id, Participant>;
  /** Null until the GM starts an encounter (FR-GM-21). */
  initiative: Initiative | null;
  /** Most recent rolls, newest last (FR-GM-22, FR-TAC-09). Capped at ROLL_LOG_LIMIT. */
  rolls: DiceRoll[];
}

export function emptyRoomState(roomId: Id): RoomState {
  return {
    roomId,
    name: "",
    scene: { map: null, grid: DEFAULT_GRID },
    tokens: {},
    participants: {},
    initiative: null,
    rolls: [],
  };
}

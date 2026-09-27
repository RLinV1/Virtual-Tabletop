import type { AssetKind, GmRoomSummary, GridSpec } from "@vtt/shared";

/** A stored library asset (ADR 0004). `objectKey` is the AssetStore key; it never leaves the server. */
export interface LibraryAssetRecord {
  id: string;
  ownerGmId: string;
  kind: AssetKind;
  objectKey: string;
  url: string;
  name: string;
  width: number;
  height: number;
  grid: GridSpec | null;
  createdAt: string;
}

/** A reusable creature (ADR 0010). `imageUrl` is read from the linked token art, never stored. */
export interface LibraryCreatureRecord {
  id: string;
  ownerGmId: string;
  name: string;
  size: number;
  maxHp: number | null;
  ac: number | null;
  imageAssetId: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export type NewCreatureRecord = Omit<LibraryCreatureRecord, "imageUrl">;
export type CreaturePatch = Partial<Pick<LibraryCreatureRecord, "name" | "size" | "maxHp" | "ac" | "imageAssetId">>;

/** The creature would link to token art that does not exist (or was deleted mid-request). */
export class CreatureImageMissingError extends Error {
  constructor() {
    super("Image must be your own token art");
  }
}

export interface NewRoomOptions {
  /** GM device identity that owns the room; null for rooms created without one. */
  ownerGmId?: string | null;
  name?: string;
}

/**
 * GM identities, owned rooms and the asset library (ADR 0004). None of this is room state:
 * it lives beside the event log, and nothing here feeds back into `RoomState`.
 */
export interface LibraryStore {
  /** Idempotent: returns the existing identity for a hash already registered. */
  registerGm(tokenHash: string): Promise<string>;
  findGm(tokenHash: string): Promise<string | null>;
  /** Rooms the GM owns, most recently active first. */
  listOwnedRooms(ownerGmId: string): Promise<GmRoomSummary[]>;

  createAsset(asset: LibraryAssetRecord): Promise<void>;
  listAssets(ownerGmId: string): Promise<LibraryAssetRecord[]>;
  /** The asset only if `ownerGmId` owns it — callers never see another GM's rows. */
  findAsset(id: string, ownerGmId: string): Promise<LibraryAssetRecord | null>;
  updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }): Promise<LibraryAssetRecord | null>;
  /** Removes the row and its reference index entries. Returns the removed row. */
  deleteAsset(id: string, ownerGmId: string): Promise<LibraryAssetRecord | null>;

  /** Replaces the set of asset ids a room's current state references. */
  setAssetRefs(roomId: string, assetIds: string[]): Promise<void>;
  /** Rooms owned by `ownerGmId` whose current state references the asset. */
  assetUsage(assetId: string, ownerGmId: string): Promise<{ id: string; name: string }[]>;

  /** The GM's creatures, newest first. Every creature read and write is scoped to its owner. */
  listCreatures(ownerGmId: string): Promise<LibraryCreatureRecord[]>;
  findCreature(id: string, ownerGmId: string): Promise<LibraryCreatureRecord | null>;
  /** Throws `CreatureImageMissingError` when `imageAssetId` names no asset. */
  createCreature(creature: NewCreatureRecord): Promise<LibraryCreatureRecord>;
  /** Null when the GM has no such creature. Throws `CreatureImageMissingError` like `createCreature`. */
  updateCreature(id: string, ownerGmId: string, patch: CreaturePatch): Promise<LibraryCreatureRecord | null>;
  deleteCreature(id: string, ownerGmId: string): Promise<boolean>;
  /** The GM's creatures whose image is this asset, for the delete warning. */
  creaturesUsingImage(assetId: string, ownerGmId: string): Promise<{ id: string; name: string }[]>;
}

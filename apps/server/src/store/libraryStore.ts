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
}

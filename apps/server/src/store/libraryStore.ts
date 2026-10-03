import type { AssetKind, DieName, GmRoomSummary, GridSpec, LegacySummary } from "@vtt/shared";

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

/** A reusable creature (ADR 0012). `imageUrl` is read from the linked token art, never stored. */
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

/** One die's picture in a dice look (ADR 0017 O3). `objectKey` never leaves the server. */
export interface DiceFaceRecord {
  objectKey: string;
  url: string;
  width: number;
  height: number;
}

export interface DiceLookRecord {
  id: string;
  ownerGmId: string;
  name: string;
  faces: Partial<Record<DieName, DiceFaceRecord>>;
  createdAt: string;
  updatedAt: string;
}

export interface NewRoomOptions {
  /** The owner row that owns the room (an account's, ADR 0017 O1); null for rooms created without one. */
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

  /** What an owner row owns, for the legacy-move offer (ADR 0017 O2). */
  ownedCounts(ownerGmId: string): Promise<LegacySummary>;
  /**
   * Moves everything the device owner row owns to the account's owner row and deletes the
   * device row, all at once (ADR 0017 O2). Null when there is no such device row. A row that
   * belongs to an account is never a device row and is never deleted here.
   */
  claimDeviceOwner(deviceOwnerId: string, accountOwnerId: string): Promise<LegacySummary | null>;

  /** The owner's dice looks, newest first (ADR 0017 O3). Every read and write is scoped to its owner. */
  listDiceLooks(ownerGmId: string): Promise<DiceLookRecord[]>;
  countDiceLooks(ownerGmId: string): Promise<number>;
  findDiceLook(id: string, ownerGmId: string): Promise<DiceLookRecord | null>;
  createDiceLook(look: DiceLookRecord): Promise<void>;
  renameDiceLook(id: string, ownerGmId: string, name: string, at: string): Promise<DiceLookRecord | null>;
  /**
   * Sets one die's picture, or resets it to classic with `face: null`. Returns the updated look
   * and the object key it replaced, for the caller to delete; null when there is no such look.
   */
  setDiceLookFace(
    id: string,
    ownerGmId: string,
    die: DieName,
    face: DiceFaceRecord | null,
    at: string,
  ): Promise<{ look: DiceLookRecord; replacedKey: string | null } | null>;
  /** Deletes the look, clearing it as anyone's look in use. Returns its object keys, or null. */
  deleteDiceLook(id: string, ownerGmId: string): Promise<string[] | null>;
}

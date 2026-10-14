import { randomUUID } from "node:crypto";
import { UvttError, removePortalOverlaps, validateUvttDraft, type PreparedUvttScene, type UvttBaseline, type UvttDraftEdit, type UvttPreparation } from "@vtt/shared";

export const UVTT_PREPARATION_TTL = 30 * 60_000;
interface Entry { roomId: string; actorId: string; expiresAt: number; view: UvttPreparation; baseline: UvttBaseline; leased: boolean; appliedSeq?: number | null }
export type UvttLease =
  | { ok: false; code: "not_found" | "invalid"; message: string }
  | { ok: true; scene: PreparedUvttScene; finish: (seq?: number | null) => void; appliedSeq?: undefined }
  | { ok: true; appliedSeq: number | null; scene?: undefined; finish?: undefined };
/** Preparations/receipts are bounded and private. Stored images follow room upload retention. */
export class UvttPreparations {
  private entries = new Map<string, Entry>();
  constructor(private now: () => number = Date.now) {}
  private sweep() { for (const [id, entry] of this.entries) if (!entry.leased && this.now() >= entry.expiresAt) this.entries.delete(id); }
  /** Checks capacity without removing drafts or reserving a slot. */
  assertCanCreate(roomId: string, actorId: string) {
    const now = this.now();
    const active = [...this.entries.values()].filter((e) => e.leased || now < e.expiresAt);
    const own = active.filter((e) => e.roomId === roomId && e.actorId === actorId && e.appliedSeq === undefined);
    if (own.length >= 2 || active.length >= 20) throw new UvttError([{ code: "preparation_limit", path: "file", severity: "error", message: "Too many preparations. Discard an unused draft or wait for it to expire." }]);
  }
  create(roomId: string, actorId: string, data: Omit<UvttPreparation, "id" | "revision">, baseline: UvttBaseline) {
    this.sweep();
    this.assertCanCreate(roomId, actorId);
    const view: UvttPreparation = { ...structuredClone(data), id: randomUUID(), revision: 1 };
    this.entries.set(view.id, { roomId, actorId, expiresAt: this.now() + UVTT_PREPARATION_TTL, view, baseline: structuredClone(baseline), leased: false });
    return structuredClone(view);
  }
  private find(roomId: string, actorId: string, id: string) {
    this.sweep();
    const e = this.entries.get(id);
    return e?.roomId === roomId && e.actorId === actorId ? e : null;
  }
  edit(roomId: string, actorId: string, id: string, edit: UvttDraftEdit) {
    const e = this.find(roomId, actorId, id);
    if (!e) return null;
    if (e.leased || e.appliedSeq !== undefined || edit.revision !== e.view.revision) throw new UvttError([{ code: "revision_conflict", path: "revision", severity: "error", message: "This preparation changed or was applied. Re-import or use the current revision." }]);
    const normalized = removePortalOverlaps(edit.walls);
    validateUvttDraft(edit.grid, normalized, e.view.map);
    e.view = { ...e.view, grid: structuredClone(edit.grid), walls: structuredClone(normalized), revision: e.view.revision + 1 };
    return structuredClone(e.view);
  }
  discard(roomId: string, actorId: string, id: string) {
    const e = this.find(roomId, actorId, id);
    if (!e || e.leased) return false;
    if (e.appliedSeq === undefined) this.entries.delete(id);
    return true;
  }
  lease(roomId: string, actorId: string, id: string, revision: number): UvttLease {
    const e = this.find(roomId, actorId, id);
    if (!e) return { ok: false, code: "not_found", message: "This preparation expired or the server restarted. Re-import the file." };
    if (revision !== e.view.revision || e.leased) return { ok: false, code: "invalid", message: "This preparation changed. Use its current revision or re-import." };
    if (e.appliedSeq !== undefined) return { ok: true, appliedSeq: e.appliedSeq };
    e.leased = true;
    return { ok: true, scene: structuredClone({ map: e.view.map, grid: e.view.grid, walls: e.view.walls, baseline: e.baseline }),
      finish: (seq) => { e.leased = false; if (seq !== undefined) { e.appliedSeq = seq; e.expiresAt = this.now() + UVTT_PREPARATION_TTL; } },
    };
  }
}

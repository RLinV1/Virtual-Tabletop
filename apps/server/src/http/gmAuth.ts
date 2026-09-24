import type { Request } from "express";
import { GM_TOKEN_HEADER } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import type { LibraryStore } from "../store/libraryStore";

/**
 * THE seam for GM identity (ADR 0004). Today: the browser's GM device token in the
 * `X-GM-Token` header. FR-GM-01 swaps this body for the session cookie (DESIGN.md §5.2);
 * no route changes.
 */
export async function resolveGm(req: Request, store: LibraryStore): Promise<{ gmId: string } | null> {
  const token = req.header(GM_TOKEN_HEADER);
  if (!token || token.length < 16 || token.length > 256) return null;
  const gmId = await store.findGm(hashToken(token));
  return gmId ? { gmId } : null;
}

import type { Request, Response } from "express";
import { GM_TOKEN_HEADER } from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import { signedIn } from "../identity/middleware";
import type { SignedIn } from "../identity/sessions";
import type { LibraryStore } from "../store/libraryStore";

/**
 * Who owns what this request acts on (ADR 0017 O1): the signed-in account's owner row, or else a
 * legacy GM device identity from the `X-GM-Token` header. This is the seam ADR 0004 reserved;
 * the routes did not change.
 *
 * A device identity can still read, edit and delete what it owns, but never create anything:
 * routes that create call `requireAccountOwner`.
 */
export type Owner =
  | { ownerId: string; via: "account"; account: SignedIn }
  | { ownerId: string; via: "device"; account?: undefined };

export async function resolveOwner(req: Request, res: Response, store: LibraryStore): Promise<Owner | null> {
  const account = signedIn(res);
  if (account) return { ownerId: account.user.ownerId, via: "account", account };
  const token = req.header(GM_TOKEN_HEADER);
  if (!token || token.length < 16 || token.length > 256) return null;
  const ownerId = await store.findGm(hashToken(token));
  return ownerId ? { ownerId, via: "device" } : null;
}

/** The owner, only when it is an account; answers 401 otherwise (ADR 0017: only accounts create). */
export function requireAccountOwner(owner: Owner, res: Response): owner is Extract<Owner, { via: "account" }> {
  if (owner.via === "account") return true;
  res.status(401).json({ error: "Sign in to do that" });
  return false;
}

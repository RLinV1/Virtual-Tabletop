import { createHash, randomBytes } from "node:crypto";

/** Opaque bearer secret handed to the browser (FR-PL-02). Only its hash is stored. */
export function newSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Short, unambiguous invite code for shareable links (FR-PL-01). */
export function newInviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

import { createHash, randomBytes } from "node:crypto";

/**
 * The server never mints participant credentials: the browser generates its own
 * 32-byte guest token (DESIGN.md §5.1) and we only ever see this hash of it.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Short, unambiguous invite code for shareable links (FR-PL-01). */
export function newInviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

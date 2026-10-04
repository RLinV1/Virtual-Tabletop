import type { Token } from "@vtt/shared";

/** What a token's Start encounter field shows: what the GM typed, else the score saved on the token last time (ADR 0022). */
export function initiativeFieldValue(typed: Record<string, string>, token: Pick<Token, "id" | "initiative">): string {
  return typed[token.id] ?? (token.initiative == null ? "" : String(token.initiative));
}

/** The entries to send: every token whose field holds a number. A cleared field gets no turn and keeps its saved score. */
export function initiativeEntries(typed: Record<string, string>, tokens: readonly Pick<Token, "id" | "initiative">[]) {
  return tokens
    .map((t) => ({ tokenId: t.id, text: initiativeFieldValue(typed, t) }))
    .filter((e) => e.text !== "" && Number.isFinite(Number(e.text)))
    .map((e) => ({ tokenId: e.tokenId, score: Number(e.text) }));
}

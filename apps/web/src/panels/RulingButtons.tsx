import type { Verdict } from "@vtt/shared";

/**
 * The GM's controls on one attack roll (attack-rulings, attack-ux-polish): Hit and Miss on a
 * to-hit roll, Apply −N on a damage roll. Shared by the Rulings list and the GM's own outcome card
 * so the two always act alike. Full-size buttons: these are the GM's most frequent taps.
 */
export function RulingButtons({
  item,
  description,
  busy,
  onRule,
  onApply,
}: {
  item: { kind: "toHit" } | { kind: "damage"; amount: number };
  /** "Aria → Goblin · Longsword, 17", for the buttons' accessible names. */
  description: string;
  busy: boolean;
  onRule: (verdict: Verdict) => void;
  onApply: () => void;
}) {
  if (item.kind === "damage") {
    return (
      <span className="ruling-buttons">
        <button type="button" disabled={busy} onClick={onApply} aria-label={`Apply ${item.amount} damage: ${description}`}>
          Apply −{item.amount}
        </button>
      </span>
    );
  }
  return (
    <span className="ruling-buttons">
      <button type="button" disabled={busy} onClick={() => onRule("hit")} aria-label={`Hit: ${description}`}>
        Hit
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => onRule("miss")} aria-label={`Miss: ${description}`}>
        Miss
      </button>
    </span>
  );
}

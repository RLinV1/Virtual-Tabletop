import { useEffect, useRef, useState } from "react";
import { attackLabel, formatAttackParties, type DiceRoll, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { throwDuration } from "../ui/diceGeometry";
import { PanelSection } from "../ui/PanelSection";
import { pendingRulings, type PendingRuling } from "./attackRoll";
import { RulingButtons } from "./RulingButtons";

/**
 * The GM's queue of attack rolls to rule on (attack-rulings, ADR 0011): to-hit rolls waiting for
 * Hit or Miss, and damage rolls waiting to be applied. Players roll without asking; the GM rules
 * afterwards, and the app never decides for them (README §7). Rendered for the GM only; the
 * server refuses these commands from anyone else regardless.
 */
export function RulingsPanel({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  const pending = pendingRulings(state);
  const throwing = useThrowing(state.rolls);
  // One request per roll at a time; the server refuses a second apply anyway.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const send = async (rollId: string, command: Parameters<RoomConnection["command"]>[0]) => {
    setBusy((s) => new Set(s).add(rollId));
    const result = await connection.command(command);
    setBusy((s) => {
      const next = new Set(s);
      next.delete(rollId);
      return next;
    });
    setError(result.ok ? null : result.message);
  };

  return (
    <PanelSection id="rulings" title={pending.length ? `Rulings (${pending.length})` : "Rulings"}>
      {pending.length === 0 ? (
        <p className="muted">Nothing to rule on.</p>
      ) : (
        <ul className="plain rulings">
          {pending.map((item) => (
            <RulingRow
              key={item.roll.id}
              item={item}
              busy={busy.has(item.roll.id)}
              rolling={throwing.has(item.roll.id)}
              onRule={(verdict) => send(item.roll.id, { type: "roll.rule", rollId: item.roll.id, verdict })}
              onApply={() => send(item.roll.id, { type: "roll.applyDamage", rollId: item.roll.id })}
            />
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </PanelSection>
  );
}

/**
 * The rolls whose dice are still in the air, so the list doesn't give a total away before the
 * dice show it: a roll that arrives while the list is showing waits as long as its throw. Rolls
 * already here when the list mounts have landed, as in the Dice panel.
 *
 * Takes the room's whole roll log, not just the pending rulings: the log is capped, so what's
 * tracked here stays bounded as rolls fall off it, and a roll whose ruling the GM clears comes
 * back to the list without being thrown again.
 */
function useThrowing(rolls: DiceRoll[]): ReadonlySet<string> {
  const initial = useRef<ReadonlySet<string> | null>(null);
  initial.current ??= new Set(rolls.map((r) => r.id));
  const [landed, setLanded] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Worked out during render, so a new roll never shows its total for even one frame.
  const throwing = new Set(rolls.filter((r) => !initial.current!.has(r.id) && !landed.has(r.id)).map((r) => r.id));

  useEffect(() => {
    const inLog = new Set(rolls.map((r) => r.id));
    for (const [id, timer] of timers.current) {
      if (inLog.has(id)) continue;
      clearTimeout(timer);
      timers.current.delete(id);
    }
    if ([...landed].some((id) => !inLog.has(id))) setLanded(new Set([...landed].filter((id) => inLog.has(id))));

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const roll of rolls) {
      if (!throwing.has(roll.id) || timers.current.has(roll.id)) continue;
      const land = () => {
        timers.current.delete(roll.id);
        setLanded((s) => new Set(s).add(roll.id));
      };
      timers.current.set(roll.id, setTimeout(land, reduced ? 0 : throwDuration(roll.dice.length)));
    }
  });
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return throwing;
}

function RulingRow({
  item,
  busy,
  rolling,
  onRule,
  onApply,
}: {
  item: PendingRuling;
  busy: boolean;
  /** The dice are still landing: the total and the controls wait for them. */
  rolling: boolean;
  onRule: (verdict: "hit" | "miss") => void;
  onApply: () => void;
}) {
  const { roll } = item;
  const attack = roll.attack!;
  const label = attackLabel(attack);
  const description = `${formatAttackParties(attack)}${label ? ` · ${label}` : ""}`;
  return (
    <li className="ruling">
      <span className="ruling-line">
        <span className="ruling-parties">{description}</span>
        <span className="ruling-total">
          <strong>{rolling ? "Rolling…" : roll.total}</strong> <span className="muted">{roll.expression}</span>
          {roll.visibility === "gm" && <em className="badge">GM only</em>}
        </span>
      </span>
      <span className="ruling-actions">
        {/* A reference for the GM's own call; nothing here compares it to the roll. */}
        <span className="muted">
          {item.kind === "toHit"
            ? item.ac === null ? "No AC" : `AC ${item.ac}`
            : `${item.hp}${item.maxHp !== null ? `/${item.maxHp}` : ""} HP`}
        </span>
        {/* Not even disabled: Apply −N and the buttons' names would give the total away. */}
        {!rolling && <RulingButtons item={item} description={`${description}, ${roll.total}`} busy={busy} onRule={onRule} onApply={onApply} />}
      </span>
    </li>
  );
}

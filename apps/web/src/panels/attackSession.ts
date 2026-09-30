import { useEffect, useRef, useState } from "react";
import type { RoomState } from "@vtt/shared";
import { usePersistentState, writeStored } from "../ui/usePersistentState";
import { LAST_USED_KEY, latestAttackRoll } from "./attackRoll";

/** What the Attack section needs to know about the last encounter end (attack-panel-encounter-reset). */
export interface AttackReset {
  /** The viewer's latest attack roll when the encounter ended; the outcome card hides it. */
  clearedRollId: string | null;
  /** Encounter ends seen since the page loaded, so a mounted Attack section can react to one. */
  count: number;
}

const isStringRecord = (v: unknown): v is Record<string, string> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((s) => typeof s === "string");

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Clears the Attack section when an encounter ends (attack-panel-encounter-reset): the target
 * (through `onReset`), the outcome card, and the custom roll settings. Named attacks and the
 * attacker stay, so the attacker's named attacks are still the ones listed. Lives in the room page, not the Attack section, so an encounter that ends while Play isn't
 * showing still clears it. Only an end seen live counts: loading a room with no encounter clears nothing.
 */
export function useEncounterReset(roomId: string, state: RoomState | null, youId: string | null, onReset: () => void): AttackReset {
  const [cleared, setCleared] = usePersistentState<Record<string, string>>("vtt.attack.cleared", {}, isStringRecord);
  const [count, setCount] = useState(0);
  const inEncounter = state ? state.initiative !== null : null;
  const previous = useRef<boolean | null>(null);
  // The same rule the outcome card uses, so the roll recorded here is the one it hides.
  const latestId = state && youId ? latestAttackRoll(state.rolls, youId, null)?.id ?? null : null;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    if (inEncounter === null) return;
    const prev = previous.current;
    previous.current = inEncounter;
    if (prev !== true || inEncounter) return;
    onResetRef.current();
    // Written here as well as by a mounted Attack section, which re-reads it only when it mounts.
    writeStored(localStorageOrNull(), LAST_USED_KEY, {});
    if (latestId) setCleared((all) => ({ ...all, [roomId]: latestId }));
    setCount((n) => n + 1);
    // latestId is read at the moment the encounter ends, not tracked.
  }, [inEncounter]);

  return { clearedRollId: cleared[roomId] ?? null, count };
}

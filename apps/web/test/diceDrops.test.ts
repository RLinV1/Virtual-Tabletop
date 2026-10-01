import { describe, expect, it } from "vitest";
import { DROP_WAIT_MS, PendingDrops } from "../src/board/diceDrops";

const drop = (expression: string, x: number) => ({ expression, from: { x, y: 0 }, to: { x, y: 10 } });
const roll = (byParticipantId: string, expression: string) => ({ byParticipantId, expression });

describe("dice drops waiting for their rolls (FR-TAC-09, ADR 0014)", () => {
  it("pairs quick throws of the same dice with their own drops, in order", () => {
    const drops = new PendingDrops();
    drops.add("pat", drop("2d6", 1), 0);
    drops.add("pat", drop("2d6", 2), 10);
    expect(drops.take(roll("pat", "2d6"), 20)?.from.x).toBe(1);
    expect(drops.take(roll("pat", "2d6"), 30)?.from.x).toBe(2);
    expect(drops.take(roll("pat", "2d6"), 40)).toBeUndefined();
  });

  it("keeps each thrower's drops apart", () => {
    const drops = new PendingDrops();
    drops.add("pat", drop("1d20", 1), 0);
    expect(drops.take(roll("sam", "1d20"), 10)).toBeUndefined();
    expect(drops.take(roll("pat", "1d20"), 10)?.from.x).toBe(1);
  });

  it("leaves a drop for other dice waiting, and drops one whose roll never came", () => {
    const drops = new PendingDrops();
    drops.add("pat", drop("1d20", 1), 0);
    drops.add("pat", drop("2d6", 2), 10);
    // A Roll-button roll sent before the throws: no drop is used.
    expect(drops.take(roll("pat", "1d8"), 20)).toBeUndefined();
    // The 1d20 was refused, so the 2d6 roll comes next and the 1d20 drop is gone.
    expect(drops.take(roll("pat", "2d6"), 30)?.from.x).toBe(2);
    expect(drops.take(roll("pat", "1d20"), 40)).toBeUndefined();
  });

  it("forgets a drop whose roll was refused", () => {
    const drops = new PendingDrops();
    const forget = drops.add("pat", drop("2d6", 1), 0);
    forget();
    expect(drops.take(roll("pat", "2d6"), 10)).toBeUndefined();
  });

  it("lets a drop go after 5 seconds", () => {
    const drops = new PendingDrops();
    drops.add("pat", drop("2d6", 1), 0);
    expect(drops.take(roll("pat", "2d6"), DROP_WAIT_MS + 1)).toBeUndefined();
  });
});

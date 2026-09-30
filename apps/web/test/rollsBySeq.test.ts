import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RollsBySeq } from "../src/net/rollsBySeq";

describe("matching a thrown roll to its ack (throw-dice-on-board, FR-TAC-09)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("answers at once when the event was applied before the ack", async () => {
    const rolls = new RollsBySeq();
    rolls.record(7, "roll-a");
    await expect(rolls.find(7, 7)).resolves.toBe("roll-a");
  });

  it("waits for an event that arrives after the ack", async () => {
    const rolls = new RollsBySeq();
    const found = rolls.find(8, 7);
    rolls.record(8, "roll-b");
    await expect(found).resolves.toBe("roll-b");
  });

  it("answers null for an applied seq that made no roll", async () => {
    const rolls = new RollsBySeq();
    await expect(rolls.find(5, 7)).resolves.toBeNull();
    await expect(rolls.find(null, 7)).resolves.toBeNull();
  });

  it("gives up after the timeout", async () => {
    const rolls = new RollsBySeq(32, 5000);
    const found = rolls.find(9, 7);
    vi.advanceTimersByTime(5000);
    await expect(found).resolves.toBeNull();
  });

  it("answers null when a resync replaces state in between", async () => {
    const rolls = new RollsBySeq();
    rolls.record(3, "roll-c");
    const waiting = rolls.find(10, 7);
    rolls.reset();
    await expect(waiting).resolves.toBeNull();
    await expect(rolls.find(3, 12)).resolves.toBeNull();
  });

  it("forgets the oldest rolls past its limit", async () => {
    const rolls = new RollsBySeq(2);
    rolls.record(1, "one");
    rolls.record(2, "two");
    rolls.record(3, "three");
    await expect(rolls.find(1, 3)).resolves.toBeNull();
    await expect(rolls.find(2, 3)).resolves.toBe("two");
    await expect(rolls.find(3, 3)).resolves.toBe("three");
  });
});

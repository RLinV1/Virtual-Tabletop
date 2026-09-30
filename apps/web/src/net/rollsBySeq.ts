/**
 * Which roll a committed seq made, for the few rolls just applied (throw-dice-on-board).
 *
 * A dice throw on the board needs the id of the roll its `dice.roll` made, and the only
 * thing the ack carries is the seq of the event it committed. The event travels ahead of
 * the ack on the same socket, so it has normally been applied by the time the ack lands;
 * `find` still waits for it briefly in case it hasn't.
 *
 * Client bookkeeping only: it reads events the client has already applied through
 * `reduce`, and changes no room state.
 */
export class RollsBySeq {
  private ids = new Map<number, string>();
  private waiting = new Map<number, Set<(id: string | null) => void>>();

  constructor(
    private readonly limit = 32,
    private readonly timeoutMs = 5000,
  ) {}

  /** The event at `seq` was applied and rolled `rollId`. */
  record(seq: number, rollId: string) {
    this.ids.set(seq, rollId);
    // Maps keep insertion order, and seqs arrive in order: the first key is the oldest.
    while (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value!);
    this.settle(seq, rollId);
  }

  /**
   * The roll made by the event at `seq`. `applied` is the last seq the client has applied:
   * a seq at or before it that made no roll (or was forgotten) answers null at once.
   * Otherwise it waits for the event, and answers null after the timeout or a `reset`.
   */
  find(seq: number | null, applied: number): Promise<string | null> {
    if (seq === null) return Promise.resolve(null);
    const known = this.ids.get(seq);
    if (known !== undefined) return Promise.resolve(known);
    if (seq <= applied) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (id: string | null) => {
        clearTimeout(timer);
        resolve(id);
      };
      const timer = setTimeout(() => {
        this.waiting.get(seq)?.delete(done);
        resolve(null);
      }, this.timeoutMs);
      let set = this.waiting.get(seq);
      if (!set) this.waiting.set(seq, (set = new Set()));
      set.add(done);
    });
  }

  /** A fresh snapshot replaced state: the events in between were never seen one by one. */
  reset() {
    this.ids.clear();
    for (const seq of [...this.waiting.keys()]) this.settle(seq, null);
  }

  private settle(seq: number, id: string | null) {
    const set = this.waiting.get(seq);
    if (!set) return;
    this.waiting.delete(seq);
    for (const done of set) done(id);
  }
}

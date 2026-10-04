import { describe, expect, it } from "vitest";
import { copyLooks, type DiceLookBackend } from "../src/ui/diceLookBackends";
import type { DiceSkin } from "../src/ui/diceSkin";

const picture = (href: string) => ({ href, width: 512, height: 512, layout: "single" as const });
const look = (id: string, name: string, images: DiceSkin["images"] = {}): DiceSkin => ({ id, name, updatedAt: 1, images });

/** A backend in memory. `refuse` names looks whose pictures the "server" won't take. */
function fakeBackend(initial: DiceSkin[], activeId: string | null, refuse: string[] = []) {
  const looks = new Map(initial.map((l) => [l.id, l]));
  let active = activeId;
  let next = 0;
  const backend: DiceLookBackend = {
    load: async () => ({ looks: [...looks.values()], activeId: active }),
    create: async (name) => {
      const made = look(`made-${++next}`, name);
      looks.set(made.id, made);
      return made;
    },
    save: async (_prev, saved) => {
      if (refuse.includes(saved.name) && Object.keys(saved.images).length > 0) throw new Error("refused");
      looks.set(saved.id, saved);
      return saved;
    },
    remove: async (id) => {
      looks.delete(id);
    },
    setActive: async (id) => {
      active = id;
    },
  };
  return { backend, looks, active: () => active };
}

describe("saving this browser's dice looks to the account (dice-looks)", () => {
  it("adds every look beside the account's, removes the browser copies, and carries the look in use", async () => {
    const browser = fakeBackend([look("b1", "Jungle", { d20: picture("data:image/webp;a") }), look("b2", "Ice")], "b1");
    const account = fakeBackend([look("a1", "Jungle")], null);

    const result = await copyLooks(browser.backend, account.backend);
    expect(result).toEqual({ saved: 2, failed: [] });
    expect([...browser.looks.keys()]).toEqual([]);
    const names = [...account.looks.values()].map((l) => l.name).sort();
    expect(names).toEqual(["Ice", "Jungle", "Jungle"]);
    const carried = [...account.looks.values()].find((l) => l.images.d20)!;
    expect(account.active()).toBe(carried.id);
  });

  it("keeps a look that can't be saved in the browser, with no half copy on the account", async () => {
    const browser = fakeBackend([look("b1", "Lava", { d6: picture("data:image/webp;x") }), look("b2", "Ice", { d6: picture("data:image/webp;y") })], null);
    const account = fakeBackend([], null, ["Lava"]);

    const result = await copyLooks(browser.backend, account.backend);
    expect(result).toEqual({ saved: 1, failed: ["Lava"] });
    expect([...browser.looks.values()].map((l) => l.name)).toEqual(["Lava"]);
    expect([...account.looks.values()].map((l) => l.name)).toEqual(["Ice"]);
  });

  it("leaves the account's look in use alone", async () => {
    const browser = fakeBackend([look("b1", "Jungle")], "b1");
    const account = fakeBackend([look("a1", "Mine")], "a1");
    await copyLooks(browser.backend, account.backend);
    expect(account.active()).toBe("a1");
  });
});

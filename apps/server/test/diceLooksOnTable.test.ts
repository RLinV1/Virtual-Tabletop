import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiceLookView } from "@vtt/shared";
import { startServer, type HttpAccount, type TestClient } from "./helpers";
import { pngOfSize } from "./pngOfSize";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const connect = async (creds: { roomId: string; guestToken: string }) => {
  const client = await server.connect(creds);
  clients.push(client);
  return client;
};

/** A look on `who`'s account with a d20 template picture. */
async function lookWithD20(who: HttpAccount, name = "Jungle") {
  const look = await who.json<DiceLookView>("POST", "/api/library/dice", { name });
  const form = new FormData();
  form.append("width", "1536");
  form.append("height", "1024");
  form.append("file", new Blob([pngOfSize(1536, 1024)], { type: "image/png" }), "d20.png");
  const res = await fetch(`${server.base}/api/library/dice/${look.id}/faces/d20`, { method: "PUT", headers: { cookie: who.cookie }, body: form });
  return (await res.json()) as DiceLookView;
}

/** Sam's room with Kira signed in at the table, both connected. */
async function table() {
  const sam = await server.signUp({ displayName: "Sam" });
  const room = await server.createRoom("Sam", { cookie: sam.cookie, roomName: "Goblin Cave" });
  const kira = await server.signUp({ displayName: "Kira" });
  const joined = await server.joinAs(kira, room.inviteCode, "Kira");
  const gm = await connect(room);
  const player = await connect({ roomId: room.roomId, guestToken: joined.guestToken });
  return { sam, room, kira, gm, player, kiraId: joined.body.participantId! };
}

describe("dice looks on the table (shared-dice-looks, ADR 0018)", () => {
  it("shows a signed-in member's own look to everyone, pictures only", async () => {
    const { kira, gm, player, kiraId } = await table();
    const look = await lookWithD20(kira);
    const ack = await player.command({ type: "participant.setDiceLook", lookId: look.id });
    expect(ack.type).toBe("ack");
    await gm.waitForSeq((ack as { seq: number }).seq);

    const onTable = gm.state.participants[kiraId]!.diceLook!;
    expect(onTable).toEqual({
      lookId: look.id,
      version: Date.parse(look.updatedAt),
      faces: { d20: { url: look.faces.d20!.url, width: 1536, height: 1024 } },
    });
    const everything = gm.rawLog.join("\n");
    expect(everything).not.toContain("Jungle");
    expect(everything).not.toContain(kira.email);
    expect(everything).not.toContain(kira.view!.id);
  });

  it("refuses a guest seat, which has no account to own a look", async () => {
    const { room } = await table();
    const guest = await connect(await server.join(room.inviteCode, "Guest"));
    const other = await server.signUp();
    const look = await lookWithD20(other);
    expect(await guest.command({ type: "participant.setDiceLook", lookId: look.id })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("refuses another account's look, even one already on the table", async () => {
    const { sam, kira, gm, player } = await table();
    const kirasLook = await lookWithD20(kira);
    await player.command({ type: "participant.setDiceLook", lookId: kirasLook.id });
    expect(await gm.command({ type: "participant.setDiceLook", lookId: kirasLook.id })).toMatchObject({ type: "rejected", code: "forbidden" });
    void sam;
  });

  it("gives a late joiner the looks already on the table", async () => {
    const { room, kira, player, kiraId } = await table();
    const look = await lookWithD20(kira);
    await player.command({ type: "participant.setDiceLook", lookId: look.id });
    const late = await connect(await server.join(room.inviteCode, "Alex"));
    expect(late.state.participants[kiraId]!.diceLook!.lookId).toBe(look.id);
  });

  it("lets the GM put a player's dice back to classic", async () => {
    const { kira, gm, player, kiraId } = await table();
    const look = await lookWithD20(kira);
    await player.command({ type: "participant.setDiceLook", lookId: look.id });
    const cleared = await gm.command({ type: "participant.clearDiceLook", participantId: kiraId });
    expect(cleared.type).toBe("ack");
    await player.waitForSeq((cleared as { seq: number }).seq);
    expect(player.state.participants[kiraId]!.diceLook).toBeNull();
  });

  it("limits a connection to 10 look changes a minute, refusing the 11th with nothing appended", async () => {
    const { kira, player } = await table();
    const a = await lookWithD20(kira, "A");
    const b = await lookWithD20(kira, "B");
    for (let i = 0; i < 10; i++) {
      expect((await player.command({ type: "participant.setDiceLook", lookId: i % 2 ? b.id : a.id })).type).toBe("ack");
    }
    const seq = player.seq;
    expect(await player.command({ type: "participant.setDiceLook", lookId: null })).toMatchObject({ type: "rejected" });
    expect(player.seq).toBe(seq);
  });
});

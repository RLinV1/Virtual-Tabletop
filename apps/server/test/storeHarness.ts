import { afterAll } from "vitest";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";

/**
 * The stores a contract test runs against: always memory, plus Postgres when DATABASE_URL is
 * set, so a checkout with no containers still gets a green `npm test`:
 *
 *   DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt npm test --workspace=@vtt/server
 */
const url = process.env.DATABASE_URL;
const postgres = url ? await PostgresRoomStore.connect(url) : null;

afterAll(async () => {
  await postgres?.close();
});

export const storeCases: [string, () => RoomStore][] = [
  ["memory", () => new MemoryRoomStore()],
  ...(postgres ? ([["postgres", () => postgres]] as [string, () => RoomStore][]) : []),
];

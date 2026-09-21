import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app";
import { MemoryRoomStore } from "./store/memoryRoomStore";

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR ?? path.join(here, "..", "uploads");
const port = Number(process.env.PORT ?? 3001);

await mkdir(uploadDir, { recursive: true });
// TODO: switch to PostgresRoomStore when DATABASE_URL is set (docs/adr/0001-event-model.md).
const app = await buildApp({ store: new MemoryRoomStore(), uploadDir, logger: true });
await app.listen({ port, host: "0.0.0.0" });

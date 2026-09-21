import path from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { RoomRegistry } from "./domain/roomRegistry";
import { registerRoutes } from "./http/routes";
import type { RoomStore } from "./store/roomStore";
import { registerSocket } from "./ws/socket";

export interface AppOptions {
  store: RoomStore;
  uploadDir: string;
  logger?: boolean;
}

export async function buildApp({ store, uploadDir, logger = false }: AppOptions) {
  const app = Fastify({ logger });
  const registry = new RoomRegistry(store);

  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  await app.register(fastifyStatic, {
    root: path.resolve(uploadDir),
    prefix: "/uploads/",
    decorateReply: false,
  });

  registerRoutes(app, { store, registry, uploadDir });
  registerSocket(app, { store, registry });
  return app;
}

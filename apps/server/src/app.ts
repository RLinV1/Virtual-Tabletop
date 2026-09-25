import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import express, { type Express } from "express";
import { Server as SocketIOServer } from "socket.io";
import { RoomRegistry } from "./domain/roomRegistry";
import { registerRoutes } from "./http/routes";
import { LocalDiskAssetStore, type AssetStore } from "./store/assetStore";
import type { RoomStore } from "./store/roomStore";
import { registerSocket } from "./ws/socket";

export interface AppOptions {
  store: RoomStore;
  uploadDir: string;
  /** Defaults to local disk, which is what tests and a container-less `pnpm dev` use. */
  assets?: AssetStore;
  logger?: boolean;
  /** Browser origin allowed to open a socket; Socket.IO enforces CORS itself. */
  clientOrigin?: string;
}

/**
 * Express for REST, Socket.IO for the realtime bus (DESIGN.md §2).
 *
 * The two share one HTTP server so a single port serves uploads, the REST API and
 * the socket upgrade — which is what the Vite dev proxy and the deploy target expect.
 */
export interface App {
  express: Express;
  server: HttpServer;
  io: SocketIOServer;
  listen(opts: { port: number; host: string }): Promise<void>;
  close(): Promise<void>;
}

export async function buildApp({
  store,
  uploadDir,
  assets,
  logger = false,
  clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
}: AppOptions): Promise<App> {
  const app = express();
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: clientOrigin },
    maxHttpBufferSize: 64 * 1024,
  });
  const registry = new RoomRegistry(store);

  app.use(express.json({ limit: "64kb" }));
  // Objects in MinIO are streamed through here so their URLs stay origin-relative and
  // work from any device. Anything MinIO does not have falls through to the disk folder,
  // so images uploaded before a checkout started using MinIO still load (upload-storage).
  if (assets?.read) {
    app.get("/uploads/:key", (req, res, next) => {
      void assets
        .read!(req.params.key)
        .then((object) => {
          if (!object) return next();
          if (object.contentType) res.type(object.contentType);
          // Content-addressed by UUID, so it can never change under a cached copy.
          res.setHeader("cache-control", "public, max-age=31536000, immutable");
          object.body.on("error", () => res.destroy());
          object.body.pipe(res);
        })
        .catch(() => next());
    });
  }
  app.use("/uploads", express.static(path.resolve(uploadDir)));
  if (logger) {
    app.use((req, _res, next) => {
      console.log(`[vtt] ${req.method} ${req.url}`);
      next();
    });
  }

  registerRoutes(app, { store, registry, uploadDir, assets: assets ?? new LocalDiskAssetStore(uploadDir) });
  registerSocket(io, { store, registry, logger });

  return {
    express: app,
    server,
    io,
    listen: ({ port, host }) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      }),
    // `io.close` also closes the HTTP server it was attached to, so closing it again
    // would raise ERR_SERVER_NOT_RUNNING.
    close: () =>
      new Promise((resolve, reject) => {
        io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

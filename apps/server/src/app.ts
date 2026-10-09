import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import express, { type Express } from "express";
import { Server as SocketIOServer } from "socket.io";
import { RoomRegistry } from "./domain/roomRegistry";
import { registerRoutes } from "./http/routes";
import { attachAccount, requireSameOrigin } from "./identity/middleware";
import { accountLimits, registerIdentityRoutes, type AccountLimits } from "./identity/routes";
import { Sessions } from "./identity/sessions";
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
  /**
   * Marks the session cookie `Secure` (ADR 0017 I1). Defaults to `COOKIE_SECURE`, else on in
   * production, so LAN phone testing over plain http still works in dev.
   */
  cookieSecure?: boolean;
  /** The clock sessions and rate limits read; tests move it forward. */
  now?: () => number;
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
  sessions: Sessions;
  limits: AccountLimits;
  /** The hourly sweep, on demand: ended sessions, then connections whose seat was deleted elsewhere. */
  sweep(): Promise<void>;
  listen(opts: { port: number; host: string }): Promise<void>;
  close(): Promise<void>;
}

export async function buildApp({
  store,
  uploadDir,
  assets,
  logger = false,
  clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  cookieSecure = cookieSecureFromEnv(),
  now = Date.now,
}: AppOptions): Promise<App> {
  const app = express();
  // Behind Fly or Railway, so `req.ip` (rate limits) and `req.secure` see the client (ADR 0017 I1).
  const trustProxy = trustProxyFromEnv();
  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: clientOrigin },
    maxHttpBufferSize: 64 * 1024,
  });
  const registry = new RoomRegistry(store);
  const sessions = new Sessions(store, { secure: cookieSecure }, now);
  const limits = accountLimits(now);
  // Ending a session ends the seats bound to it; close their open connections (ADR 0017 M4).
  sessions.whenEnded((ended) => void registry.closeCredentials(ended.credentialHashes));
  const closeDeletedSeats = () => registry.closeDeletedCredentials();
  const stopSweeping = sessions.startSweeping(closeDeletedSeats);
  const stopLimitSweep = setInterval(() => Object.values(limits).forEach((l) => l.sweep()), 60_000);
  stopLimitSweep.unref();

  app.use(express.json({ limit: "64kb" }));
  app.use(attachAccount(sessions));
  app.use(requireSameOrigin(sessions, clientOrigin.split(",").map((o) => o.trim())));
  // Uploaded pictures are drawn on other people's screens (dice looks, ADR 0018): never let a
  // browser second-guess their type into something that runs.
  app.use("/uploads", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
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

  registerIdentityRoutes(app, { store, sessions, limits });
  registerRoutes(app, { store, registry, uploadDir, assets: assets ?? new LocalDiskAssetStore(uploadDir), limits });
  registerSocket(io, { store, registry, sessions, logger });

  return {
    express: app,
    server,
    io,
    sessions,
    limits,
    sweep: async () => {
      await sessions.sweep();
      await closeDeletedSeats();
    },
    listen: ({ port, host }) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      }),
    // `io.close` also closes the HTTP server it was attached to, so closing it again
    // would raise ERR_SERVER_NOT_RUNNING.
    close: () => {
      stopSweeping();
      clearInterval(stopLimitSweep);
      return new Promise((resolve, reject) => {
        io.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function cookieSecureFromEnv(): boolean {
  const value = process.env.COOKIE_SECURE;
  if (value === undefined || value === "") return process.env.NODE_ENV === "production";
  return value === "1" || value.toLowerCase() === "true";
}

/**
 * `TRUST_PROXY`: a hop count ("1"), or "true" to trust every proxy. Unset leaves Express's default.
 *
 * "true" makes `req.ip` the left-most `X-Forwarded-For` entry, which the client writes itself, so
 * anyone could pick a fresh address per request and walk past every per-address limit (sign-in,
 * sign-up, invite joins). Production must name its hop count instead, and a value that is neither
 * is refused rather than ignored (security-hardening D5).
 */
export function trustProxyFromEnv(env: NodeJS.ProcessEnv = process.env): number | boolean | undefined {
  const value = env.TRUST_PROXY;
  if (!value) return undefined;
  const production = env.NODE_ENV === "production";
  if (value === "true") {
    if (production) {
      throw new Error("TRUST_PROXY=true lets clients forge their address; set it to the number of proxies in front of the server, e.g. TRUST_PROXY=1");
    }
    console.warn("[vtt] TRUST_PROXY=true trusts X-Forwarded-For from anyone, so per-address rate limits can be bypassed. Use a hop count outside local testing.");
    return true;
  }
  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;
  if (production) throw new Error(`TRUST_PROXY must be a hop count such as 1, not "${value}"`);
  console.warn(`[vtt] ignoring TRUST_PROXY="${value}": expected a hop count such as 1`);
  return undefined;
}

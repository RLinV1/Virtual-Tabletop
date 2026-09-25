## Context

`createAssetStore(uploadDir)` reads `MINIO_ENDPOINT`. When it's set, it connects with `MinioAssetStore.connect` (the bucket is created and made public-read), and when it isn't, it returns `LocalDiskAssetStore`. `buildApp` registers a MinIO-backed `GET /uploads/:key` that answers 404 on a miss, then `express.static(uploadDir)`.

## Decisions

### Choosing the store
`createAssetStore(uploadDir, env = process.env, connect = MinioAssetStore.connect)` decides in this order:
1. `MINIO_ENDPOINT` set → `connect` with it. Errors propagate, so startup fails loudly, as today.
2. `NODE_ENV === "production"` → throw `MINIO_ENDPOINT is required in production`.
3. `MINIO_AUTODETECT === "0"` → local disk.
4. Otherwise probe: `connect({ endpoint: "http://127.0.0.1:9000", attempts: 1 })` raced against a 1 s timeout. On success, use MinIO and log `found MinIO at ...`. On failure or timeout, use local disk and log `no MinIO at 127.0.0.1:9000 — storing uploads on local disk`.

Why `127.0.0.1` and not `localhost`: on this team's Windows machines a WSL relay listens on `::1:9000`, so `localhost` can reach the wrong service (see the archived `reject-duplicate-display-names` design, D6). The connect call creates the bucket and sets its policy, which is idempotent, so probing and connecting are the same call. `connect` and `env` are parameters so the choice can be unit-tested without a real MinIO.

The S3 client retries by default. The probe passes `attempts: 1` (a new optional `connect` option, mapped to the client's `maxAttempts`), so a refused connection fails immediately instead of retrying against the timeout.

### Disk copy alongside MinIO
Multer writes every upload to `uploadDir`, and `MinioAssetStore.put` copies it to the bucket without removing it. That is kept deliberately: the disk copy is the fallback for `/uploads`. `createAssetStore` wraps a MinIO store in `withDiskCopy`: `put` and `read` go to MinIO, and `delete` removes the MinIO object and then the disk file. Without the second delete, the fallback route would keep serving a deleted library asset.

### Serving old disk files after the switch
In the MinIO route, a null body or any read error calls `next()` instead of answering 404, so `express.static(uploadDir)` gets a chance. A disk miss still ends in Express's 404, so the response code for a missing file doesn't change.

## Risks

- **Something else is listening on port 9000** in dev: the probe's S3 calls fail, so the server falls back to disk and logs it. `MINIO_AUTODETECT=0` skips the probe.
- **The probe adds up to 1 s to dev startup** when nothing is listening. A refused connection returns in milliseconds; the full second is spent only when the port silently drops packets.

## Verification

- Unit (`apps/server/test/assetStore.test.ts`): explicit endpoint connects; production without an endpoint throws; `MINIO_AUTODETECT=0` gives disk; a probe that resolves gives MinIO; a probe that rejects or hangs gives disk within the timeout.
- Integration: with a MinIO-like store whose `read` misses, a file in `uploadDir` is served at `/uploads/<key>`.
- Manual: `docker compose up -d minio`, then `npm run dev` with no env → log says MinIO; upload a map; the object appears in the `vtt-assets` bucket.
- `npm run lint && npm run typecheck && npm test`.

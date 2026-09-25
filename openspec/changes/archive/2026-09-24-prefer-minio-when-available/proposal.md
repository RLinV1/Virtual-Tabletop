## Why

Uploaded maps and token art should live in MinIO (DESIGN.md §2), not in a folder on the server. Today the server only uses MinIO when `MINIO_ENDPOINT` is set. Plain `npm run dev` doesn't set it, so uploads quietly land in `apps/server/uploads/` even when the team's `docker compose` MinIO is running. And nothing stops a production server started without `MINIO_ENDPOINT` from writing to disk, where files are lost when the machine is replaced.

Decision (2026-09-24): the eight built-in images stay in the web app's `public/img/` (`builtin-library-assets`). Every uploaded asset goes to MinIO whenever MinIO is available.

## What Changes

- **Use MinIO whenever it's up.** When `MINIO_ENDPOINT` is unset, the server checks for the `docker compose` MinIO at `http://127.0.0.1:9000` with its default credentials. If it answers within a second, uploads go there. Otherwise the server falls back to local disk as today and logs why.
- **Production never falls back.** With `NODE_ENV=production`, a missing `MINIO_ENDPOINT` or an unreachable MinIO stops the server at startup with a clear error.
- **Explicit settings win.** A set `MINIO_ENDPOINT` behaves as today: the server connects and fails at startup if it can't. `MINIO_AUTODETECT=0` turns the check off and forces local disk, for CI or a machine where port 9000 is something else.
- **Every upload is kept on disk too.** The upload handler already writes each file to `uploads/` first. With MinIO, the file is also copied to MinIO, which serves it, and the disk copy stays as the fallback. Deleting a library asset removes both copies. Before this change, a delete removed only the MinIO copy, so the fallback below would have kept serving a deleted image.
- **Older disk uploads keep working.** When MinIO has no object for `/uploads/<key>`, the request falls through to the disk folder. Images uploaded before the switch still load. Nothing is migrated.
- **Docs.** `docker-compose.yml`, README and DESIGN.md say that `MINIO_ENDPOINT` is optional in dev when compose is running.

## Capabilities

### New Capabilities
- `upload-storage`: where uploaded images are stored, and how the server chooses and serves that storage.

### Modified Capabilities
None.

## Impact

Server only: `apps/server/src/store/assetStore.ts` (the store choice), `apps/server/src/app.ts` (`/uploads` falls through to disk), and docs. No schema, event or client change. URLs stay origin-relative `/uploads/<key>`, so existing rooms are unaffected. Tests use `buildApp` with a disk store and don't call `createAssetStore`, so CI doesn't need MinIO.

## Non-goals

- Copying existing disk uploads into MinIO.
- Moving the built-in images into MinIO.

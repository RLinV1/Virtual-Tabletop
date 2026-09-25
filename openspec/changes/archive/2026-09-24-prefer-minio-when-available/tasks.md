## 1. Store choice

- [x] 1.1 `createAssetStore(uploadDir, env, connect)`: explicit endpoint, production guard, `MINIO_AUTODETECT=0`, and a 1 s probe of `http://127.0.0.1:9000` with a single S3 attempt; log the choice.
- [x] 1.2 Unit tests for each branch in `apps/server/test/assetStore.test.ts`.

## 2. Serving

- [x] 2.0 Keep every upload on disk as well as in MinIO, and make delete remove both copies (`withDiskCopy`); unit test.
- [x] 2.1 The MinIO `/uploads/:key` route falls through to `express.static` on a miss or error; integration test serving a disk-only file while a MinIO-like store is active.

## 3. Docs and verification

- [x] 3.1 Update the `docker-compose.yml` header, README and DESIGN.md: MinIO is picked up automatically in dev, and required in production.
- [x] 3.2 Manual: with compose MinIO up and no env, the store choice finds MinIO in about 120 ms and an upload lands in `vtt-assets`. "Down" was checked as a refused probe to a closed port (62 ms), not by stopping the team MinIO; the fallback itself is unit-tested.
- [x] 3.3 `npx openspec validate prefer-minio-when-available`, then `npm run lint && npm run typecheck && npm test`.

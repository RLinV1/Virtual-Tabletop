## 1. S3 client

- [x] 1.1 Set `requestChecksumCalculation: "WHEN_REQUIRED"` in `S3AssetStore.connect` in `apps/server/src/store/assetStore.ts`; verify a streamed PUT from the rebuilt server container to SeaweedFS succeeds

## 2. Verify

- [x] 2.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [x] 2.2 Rebuild and recreate `server`, upload a map through the app, and verify `POST /api/uploads` returns 2xx

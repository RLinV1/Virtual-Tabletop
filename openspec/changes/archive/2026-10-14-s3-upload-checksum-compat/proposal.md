## Why

Uploads fail with a 500 when the server stores them in the compose SeaweedFS (`POST /api/uploads` answers `InvalidAccessKeyId`). The AWS SDK adds a trailing checksum to streamed uploads by default, and the current SeaweedFS image does not accept that request form. A small non-streamed upload with the same credentials works.

## What Changes

- The S3 client asks for a request checksum only when an operation requires one, so streamed uploads are plain requests that SeaweedFS accepts.
- No API, event, state or storage-layout change. Objects, keys and URLs are the same.

## Capabilities

### Modified Capabilities
- `upload-storage`: uploads to object storage succeed against SeaweedFS.

## Impact

- `apps/server/src/store/assetStore.ts` (S3 client options).
- Verified against the compose SeaweedFS by a streamed upload; the existing `assetStore.test.ts` still passes.

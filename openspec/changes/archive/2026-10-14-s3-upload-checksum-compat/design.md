## Context

See proposal.md - Why. `S3AssetStore.put` streams the temp file with `ContentLength`. Recent `@aws-sdk/client-s3` versions then send a trailing CRC32 checksum (aws-chunked). SeaweedFS answers that form with `InvalidAccessKeyId` even though auth is off.

## Decisions

1. **Set `requestChecksumCalculation: "WHEN_REQUIRED"` on the S3 client for non-AWS endpoints.** AWS S3 (`*.amazonaws.com`) keeps the SDK default, so production on AWS still sends upload checksums. This is the SDK's documented setting for S3-compatible stores that lack trailing-checksum support. Checked in the compose stack: the same streamed PUT fails without it and succeeds with it. Rejected: buffering the whole file in memory in `put` (costs memory for large images), and pinning an older SeaweedFS image (hides the problem and drifts from `latest`).

## Risks / Trade-offs

- [No upload checksum on the wire] -> the store was never verifying it before this SDK default; TLS and the store's own integrity checks apply.

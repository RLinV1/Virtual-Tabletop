# ADR 0038: Confidence on detected walls

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Amends:** `docs/adr/0029-walls-and-wall-detection.md` · **Changes:** `openspec/changes/wall-confidence-review`
**Owner:** Real-Time Architecture (Raymond)

## Context

The learned wall detector (`learned-wall-detection`) gets about 40% of maps to 90% recall and precision, so the GM reviews most results. The preview draws every detected wall alike, so the wrong ones are hard to find.

## Decision

`DetectedWall` gains an optional `confidence`, a number from 0 to 1: the mean model probability along the traced segment. The vision worker sets it only for the learned model; other pipelines omit it, and a result without it stays valid and means "not doubtful". `DOUBTFUL_WALL_CONFIDENCE` (0.6) and `isDoubtfulWall` in `packages/shared` define which walls the preview flags.

No `Command`, `DomainEvent` or `RoomState` change. "Apply confident walls only" is the existing `wall.applyDetected` with `exclude.indices` listing the doubtful walls, still checked against `resultId`. `decide` copies only `a` and `b` into room walls, so confidence is never stored in a room. `resultId` is a hash of the walls JSON, so it now covers confidence too.

## Consequences

The field is optional, so old workers and stored results parse unchanged. A worker that sends a value outside 0..1 fails validation, and the job fails like any malformed result. The score is a model probability, not a calibrated one; the threshold may need tuning.

# ADR 0028: Private grid detection HTTP contract

## Status

Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-10.

## Context

Automatic grid analysis is an upload-side suggestion. Room state and its event protocol must remain the authority for accepted grids. The existing direct upload path also serves tokens.

## Decision

Add validated shared schemas for a bounded candidate and five private analysis states. Expose them only from GM-authorized REST endpoints. `purpose=map` on direct room uploads opts into analysis; omitted purpose continues to mean token. No analysis field enters `RoomState`, commands, events, or player snapshots. Only an explicit existing grid save or `scene.setGrid` commit changes an accepted grid.

## Consequences

Editors can poll without changing synchronization semantics. Status endpoint authorization and ownership checks are a new privacy boundary and require server integration tests. The contract requires real-time architecture owner review before merge under `CLAUDE.md`.

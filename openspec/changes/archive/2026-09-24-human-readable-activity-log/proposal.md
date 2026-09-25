## Why

FR-REC-01 (Should), tracked by KAN-68, requires the GM to identify committed actions and their actors. The live client has no event history and the 30-roll state window cannot fulfill the full log deferred from KAN-65.

## What Changes

- Add authenticated, GM-only room history with newest-first cursor pagination and player search across history.
- Format every domain event as a human-readable sentence with actor attribution, including deleted-token names.
- Expose Activity log from the room page in the existing KAN-65 Modal component; preserve dice history.
- Validate new request/response contracts with Zod and filter every returned event through filterEventForViewer.
- Cover formatting, visibility, authorization, pagination, and history beyond the roll cap with tests.

## Capabilities

### New Capabilities
- `room-activity-log`: GM access to paged, searchable, attributed committed history.

### Modified Capabilities
None.

## Impact

Shared pure formatting/projection and additive schemas, server history route, web modal and API client, and shared/server tests. No existing event, state, or protocol schemas change; no database migration. No undo, player history, ephemeral history, or fog implementation. Fog has no current DomainEvent; GM-only access also protects future history until explicitly extended.

Implementation is based on origin/main at 6e646aa on codex/kan-68-activity-log, including merged KAN-65. Reuse its Modal and preserve Roll history; place Activity log in the board toolbar so it remains reachable with a collapsed sidebar. OpenSpec config contains obsolete pre-code stack context; implementation follows CLAUDE.md and accepted ADRs 0001-0004 and the existing React/Pixi, Express/Socket.IO, opaque room-token architecture.


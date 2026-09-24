## Why

Nothing stops two guests from joining the same room with the same display name. `Participant.displayName` is only checked for length (`packages/shared/src/state.ts:15`). The participants list, token ownership assignment (FR-GM-10), and guest revocation (FR-GM-20, KAN-52) all show people to the GM by display name. If two people share a name, the GM cannot tell which one a control affects. Tracked as KAN-61.

## What Changes

- The server rejects a guest join when an active participant in the room already has that display name. Comparison trims surrounding whitespace and ignores case, so "raymond", "Raymond " and "Raymond" collide.
- The server rejects `participant.rename` to a name another active participant already has, using the same comparison. Changing the case of your own name is allowed.
- A display name that is empty after trimming is rejected. Accepted names are stored trimmed.
- The check is a pure function in `packages/shared` (`decideJoin`, next to `decide`). The join route calls it inside the room's ordered queue, so two concurrent joins with the same name cannot both succeed. Today the join route appends `ParticipantJoined` directly and never goes through `decide`.
- The join route saves the guest credential only after the join is accepted. Today it saves the credential first, so a rejected join would leave a credential that points to no participant.
- A rejected join returns HTTP 409 with a readable `error` message. The join form shows that message inline and keeps what the user typed so they can change it and try again.
- Duplicates are rejected, never renamed automatically (no "Raymond (2)").
- Dev tooling only: add a `server-compose` entry to `.claude/launch.json` that runs the server against the `docker compose` Postgres, Redis and MinIO.

No zod schema in `packages/shared` changes shape, and `RejectionCode` is unchanged. A name conflict on rename uses the existing `invalid` code, so no ADR is needed.

## Capabilities

### New Capabilities
- `room-participants`: who is in a room and how they are identified to others. This change adds the display-name uniqueness rule for join and rename.

### Modified Capabilities
<!-- None: openspec/specs/ has no capabilities yet. -->

## Impact

- `packages/shared/src/decide.ts`: new `normalizeDisplayName`, `isDisplayNameTaken` and `decideJoin`. The `participant.rename` case gains the collision check.
- `apps/server/src/domain/liveRoom.ts`: new `join()` that runs `decideJoin` and commits inside `runExclusive`.
- `apps/server/src/http/routes.ts`: the invite-join route uses `room.join()`, saves the credential only on success, and maps a conflict to 409. Room creation trims the GM's name.
- `apps/web/src/pages/JoinPage.tsx`: shows the conflict inline and keeps the typed name. `net/api.ts` already turns `body.error` into the thrown message.
- Tests: `packages/shared/test/decide.test.ts` (join and rename collisions) and `apps/server/test/sync.test.ts` (two clients racing for the same name, reconnect with an existing credential).
- `.claude/launch.json`: new `server-compose` configuration. It does not affect runtime behavior.
- Dependency: the room has no "left" or "revoked" participant state yet (revocation lives only on the credential row). Until FR-GM-20/KAN-52 adds that state, every participant in `RoomState` counts as active. See design.md.

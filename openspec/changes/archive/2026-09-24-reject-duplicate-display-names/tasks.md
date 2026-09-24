# Tasks

## 1. Contract helpers (packages/shared)

- [x] 1.1 In `decide.ts`, add and export `normalizeDisplayName(name)` (NFC, trim, `toLocaleLowerCase("en-US")`), a single `isActive(p)` predicate that returns `true` for now (design D4), and `isDisplayNameTaken(state, name, exceptId?)`. Verify with unit tests in `packages/shared/test/decide.test.ts` under `describe("display name uniqueness (KAN-61)")`: "raymond", "Raymond " and "  RAYMOND" match "Raymond"; `exceptId` excludes that participant; a participant for whom `isActive` returns false does not count (stub the predicate or test it directly).
- [x] 1.2 Add `decideJoin(state, { id, role, displayName })` that trims the name, rejects a blank name and a taken name with `code: "invalid"` plus a server-side `reason` (`"blank" | "name_taken"`), and otherwise returns `[ParticipantJoined]` with the trimmed name (design D1, D3, D5). Verify with unit tests: accepted join stores the trimmed name; a case-insensitive duplicate is rejected with `reason: "name_taken"` and a message containing "already taken"; `"   "` is rejected with `reason: "blank"` (spec: Joining with a name already in use is rejected; Display names are trimmed and must not be blank).
- [x] 1.3 In the `participant.rename` case of `decide`, trim the name, reject a blank name, and reject a name taken by another participant (`isDisplayNameTaken(state, name, actor.id)`) before building `ParticipantRenamed`. Verify with unit tests: a rename to "ALEX" when "Alex" exists is rejected and emits no events; "sam" to "Sam" is accepted with `previous: "sam"` (spec: Renaming to a name already in use is rejected).
- [x] 1.4 Run `npm run typecheck` and `npm test --workspace=@vtt/shared`, and confirm no zod schema, `RejectionCode`, or `DomainEvent` shape changed (`git diff packages/shared/src/{state,commands,events,protocol}.ts` is empty).

## 2. Server pipeline (apps/server)

- [x] 2.1 Add `LiveRoom.join(participant)` that runs `decideJoin(this.state, participant)` and `commit` inside one `runExclusive` step and returns the decision (design D2). Verify with `npm run typecheck`.
- [x] 2.2 Change `POST /api/invites/:inviteCode/join` to call `room.join()` first, call `store.saveCredential` only on success, and return 409 for `name_taken` and 400 for `blank`, each with `{ error: message }`. Trim `displayName` in `POST /api/rooms` too. Verify with the integration tests in 2.3.
- [x] 2.3 Add `describe("unique display names (KAN-61)")` to `apps/server/test/sync.test.ts` (extend `helpers.ts` with a join call that returns the status instead of throwing if needed). Cover: a duplicate join returns 409 and the room snapshot still has one "Raymond"; the rejected guest token cannot authenticate a socket; two `Promise.all` joins as "Sam" give exactly one 200 and one 409; a guest joining as "  Raymond  " appears as "Raymond"; a socket `participant.rename` to a taken name gets a `rejected` reply and no event; a guest who reconnects with their stored credential keeps their name. Verify with `npm test --workspace=@vtt/server -- -t "KAN-61"`.

## 3. Web (apps/web)

- [x] 3.1 In `JoinPage.tsx`, keep `displayName` in state on error (already true), link the error to the input with `aria-describedby` and `aria-invalid` when the server rejects the name, and clear the error when the user edits the name. Verify in the running app (`server-compose` + `web`): join as "Raymond" in one browser tab, then join as "raymond" in a private tab. The inline message appears, the typed name is kept, and changing it to "Ray" and submitting enters the room without a reload (spec: Join form shows a name conflict inline).

## 4. Dev tooling and wrap-up

- [x] 4.1 Keep the `server-compose` entry in `.claude/launch.json` (design D6). Verify that `docker compose up -d` followed by starting `server-compose` logs "using Postgres event store" and "storing uploads in MinIO". The `web` entry sets `VTT_SERVER=http://127.0.0.1:3001`; verify that `curl localhost:5173/api/health` returns 200 through the proxy.
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and confirm everything passes. Record in the PR that the "Revoked participant frees the name" scenario stays untested until KAN-52 adds revocation state (design D4). Use a PR title that references KAN-61.

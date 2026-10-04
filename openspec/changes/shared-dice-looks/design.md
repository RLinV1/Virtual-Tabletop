# Design

## Context

See proposal.md for why. This change builds on `user-accounts`:
- **Ownership:** `dice_looks` rows owned through `users.owner_id` (O3), with pictures in the asset store at `/uploads/<uuid>`.
- **Membership:** `room_members(room, participant, user)` (M1) is the only place that knows which account holds a participant's seat. It is consulted on the server only.
- **Web:** `ui/diceSkinStore.ts` serves the person's looks through `useDiceLooks` and `useActiveDiceLook`, from the account or the browser. Today the renderers pass a look to `Die3D` only for a roll marked `skinned`, meaning the viewer's own public roll (`RoomPage`, `board/ThrownDice.tsx`, `panels/DiceThrowHandle.tsx`).
- **Kernel:** `Participant` is `{ id, role, displayName, left?, revoked? }` in `packages/shared/src/state.ts`. `decide` is pure and takes `DecideContext { newId, random? }`. `LiveRoom.submit` runs `decide` inside the room's exclusive queue. Undo covers only the events ADR 0013 lists, and the activity log maps events to entries in `activityLog.ts`.

## Goals / Non-Goals

**Goals:**
- Every participant sees each person's public rolls in that person's look, from room state, so late joiners and replays agree.
- Only the owner can use a look: enforced on the server, and `decide` stays pure.
- The room receives drawing data only: picture URLs and sizes. It never receives a name, an owner or an account.

**Non-Goals:**
- Pushing a look edit into rooms the owner is not in. The owner's client brings the room up to date when they next enter (D4).
- Sharing, gifting or trading looks between accounts.
- Content moderation beyond the GM reset, the viewer toggle and server-side file checks.

## Decisions

### D1. The look is participant state, set by an event

```
Participant.diceLook?: DiceLookOnTable | null      (nullish: old events and snapshots replay unchanged)
DiceLookOnTable = { lookId: Id, version: number, faces: Partial<Record<DieName, { url, width, height }>> }

Command  participant.setDiceLook   { lookId: Id | null }            the actor's own seat only
Command  participant.clearDiceLook { participantId: Id }            GM only, target a player
Event    ParticipantDiceLookSet    { participantId, look: DiceLookOnTable | null,
                                     previous: DiceLookOnTable | null }   (invariant 6)
```

- `lookId` lets the owner's client compare what the room has with their own choice.
- `version` is the look's `updated_at` in milliseconds, read from the database by `LiveRoom`. It is data passed into `decide`, never a clock read there.
- There is no `name` field, so the table cannot learn what the owner called it.

**Why state plus an event, not an ephemeral relay:** a relay is never persisted (invariant 4). A late joiner, a reconnecting player or a replay of the log would then see classic dice where the others see the look. The renderer needs the look whenever a roll is drawn, and the roll itself is in the log.

**Why on the participant, not on each `DiceRolled`:** one event per change instead of copying six URLs into every roll. It also keeps `DiceRolled`, which is undo-adjacent and log-heavy, unchanged.

**Cost:** a historical roll replays in the look the participant has *now*, not the one they had when they rolled. Rolls are shown live, the log keeps the numbers, and `ParticipantDiceLookSet` events record when looks changed, so nothing is lost that the product shows.

### D2. "Only the owner can use it": resolved before `decide`, decided inside it

`LiveRoom.submit`, for `participant.setDiceLook` with a non-null `lookId`, inside the exclusive queue and before `decide`:

1. `membershipStore.userForParticipant(roomId, actorId)`. With no row, the seat is not kept on an account.
2. `libraryStore.findDiceLook(lookId, ownerIdOf(user))`. With no match, the look is not theirs.
3. Pass the result as `DecideContext.ownedDiceLook: DiceLookOnTable | null`.

`decide` then:
- refuses as `forbidden` unless `ctx.ownedDiceLook?.lookId === command.lookId`;
- refuses `forbidden` for a participant who has left or been removed (the existing active check);
- emits `ParticipantDiceLookSet` with the actor as the target. There is no target field, so a participant cannot set someone else's look.

`lookId: null` needs no lookup.

**Why:** `decide` must stay pure (invariant 2), so it cannot query the database. ADR 0004 already named this exact shape for ownership checks: "the check belongs in a pre-decide lookup in `LiveRoom`, recorded in a new ADR". That ADR is 0018.

**Alternatives:**
- *Trust a `look` object the client sends:* anyone could put any URL on the table, including another person's pictures. That fails "only the owner can use it".
- *Server-only command type injected after the socket:* it splits `Command` into client and internal variants for one field. A context value is simpler and testable in `decide` unit tests.

`participant.clearDiceLook` needs no lookup. `decide` allows it when the actor is the GM and the target is an active player with a look, and it emits the same event with `look: null`.

### D3. Visibility, undo and the log

- **Visibility:** the event and the participant field are public to the room. They contain URLs and sizes only (D1). `filterEventForViewer` passes the event unchanged and `filterStateForViewer` passes the field. Both gain an explicit `case` and a test asserting the payload has no account id, email or look name.
- **Undo:** not reversible. ADR 0013's list is unchanged, so the GM cannot "undo" a player's choice of dice. They reset it instead (D2).
- **Activity log:** skipped. A dice look change is cosmetic noise in the "what happened" log. The table sees the result on the next roll.

### D4. Keeping the table in step with the owner: the client syncs, the server checks

The room page sends `participant.setDiceLook` when any of these happens:
- the person chooses a look;
- they choose Classic (`null`);
- the look in use changes `version`;
- they enter a room whose `participants[me].diceLook` differs from their choice by `lookId` or `version`.

Rooms the person is not in keep the last copy until they enter.

**A GM reset is respected:** the sync runs on the person's own choice changing and on entering
the room, never because the table's copy changed. After the GM puts someone's dice back to classic,
they stay classic until that person chooses a look again, or next enters the room.

**A look deleted while it is on the table elsewhere:** its objects are gone, so those rooms' viewers load 404s and fall back to classic (D6). The owner's next visit sends `null`.

**Rate limit:** 10 look changes per minute per connection, the same pattern as the chat limiter in `ws/socket.ts`. Every change is a persisted event.

**Why the client syncs:** pushing from the server would need a reverse index from looks to rooms, plus loading every such room's `LiveRoom` on each edit. The client already knows which rooms are open and what it chose. Every sync still goes through D2, so the client cannot set anything the server would not allow.

### D5. Pictures others load are checked from the file

Once other people's browsers load the pictures, declared dimensions are no longer enough (O3 in `user-accounts` trusted them). The dice face upload now reads the real type and dimensions from the file header with `image-size` (pure JS, no native code):
- it must be PNG, JPEG or WebP;
- it must be 3:2 up to 1536 × 1024, or 1:1 up to 512 × 512;
- the declared dimensions must match.

`/uploads` responses gain `X-Content-Type-Options: nosniff`. That covers every upload, not just dice: a file can never be reinterpreted as script or HTML.

**Alternative:** decode and re-encode on the server (`sharp`). It strips anything hidden in the file, but adds a large native dependency. The browser already re-encodes, header checks bound type and size, and the GM reset and viewer toggle cover what the picture shows. `sharp` can be added later if needed.

### D6. Rendering

- **Every public roll:** drawn with `participants[roller].diceLook` from room state, for every viewer, the roller included. This replaces the `skinned` flag.
- **Fallback for a roller with no table look:** if the roller is the viewer, their browser look is used (signed-out guests, as today).
- **GM-only rolls:** stay slate.
- **"Show other players' dice looks":** a per-viewer setting in `localStorage` (default on). When off, other rollers are drawn classic.
- **Missing pictures:** `Die3D` preloads a look's face URLs (cached; `/uploads` objects are immutable). A die whose picture fails to load is drawn classic, so nobody ever sees a broken image.
- **Bandwidth:** each viewer loads at most six pictures per participant, each tens of KB after the browser re-encode, and immutable caching means once.

## Risks / Trade-offs

- **[Offensive pictures shown to others]** → The GM reset (D2), the viewer toggle (D6), server file checks and `nosniff` (D5). Kicking the player (room-access) remains for persistent abuse.
- **[Historical rolls replay in the current look]** → Accepted (D1). The numbers are what the log is for.
- **[Stale look in rooms the owner is away from]** → Updated on their next entry (D4). A deleted look falls back to classic, not a broken image.
- **[A persisted event per look change]** → Rate-limited to 10 per minute per connection. Changes are rare in practice.
- **[Schema change to `Participant`, `Command`, `DomainEvent` and `DecideContext`]** → All additions; `diceLook` is nullish, so old logs replay. ADR 0018 and Raymond's review, per CLAUDE.md.

## Migration Plan

- No database migration: the look on the table lives in room events.
- Ship the shared schema, server and web together. Older clients ignore the unknown participant field, because zod strips it, and draw classic.
- **Rollback:** reverting the code leaves `ParticipantDiceLookSet` events in logs. Before reverting, `reduce` must keep a no-op branch for them, or the revert must keep the schema entry. ADR 0018 records this.

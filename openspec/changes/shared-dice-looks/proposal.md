# Proposal

## Why

Players bring their own dice to a real table, and everyone sees them roll. In the app today, a dice look (`dice-image-skins`) is drawn only on its owner's own screen, and everyone else sees classic rust dice. That design was deliberate: showing a look to others means putting it in the shared room state, which needed an ADR and accounts to prove who owns which look.

`user-accounts` provides both pieces:
- **looks saved on the server**, owned by an account (O3);
- **a link from each room seat to its account** (`room_members`, M1).

The table can now see each person's dice, and the server can make sure **only the owner can use a look**.

## What Changes

- **Everyone sees your dice.** A signed-in person whose seat is kept on their account can put their dice look on the table. From then on, every participant sees that person's public rolls in that look:
  - thrown in the middle of the board;
  - dropped on the map;
  - the die being dragged.
  - GM-only rolls keep the private slate look for everyone.
- **Only the owner can use a look.**
  - The server applies a look to a participant only when the look belongs to the account that holds that participant's seat.
  - There is no way to apply someone else's look, and the Dice tab never lists other people's looks.
  - What the table receives is a set of picture addresses for drawing, with no look name, owner or account.
- **It follows your choice.** Choosing a look, or editing the look in use, updates it in each room you open. Choosing Classic takes it off the table.
- **Moderation.**
  - The GM can put any player's dice back to classic in their room.
  - Each viewer can turn other people's looks off on their own screen.
  - Pictures shown to others are re-checked by the server from the file itself, not from what the browser claims.
  - Uploaded pictures are served with `nosniff`.
- **Guests and signed-out players** keep today's behaviour: a browser-kept look is drawn only on their own screen. The Dice panel says that signing in (and keeping the seat) shows their dice to the table.
- **A missing picture falls back to classic** for that die, for example after the owner deleted or replaced it.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `dice-looks`:
  - "a look dresses only the viewer's own public rolls" becomes "the table sees each person's look";
  - where looks are kept now includes the room;
  - new requirements for owner-only use, GM reset, the viewer's toggle and missing pictures.

## Impact

- **Room kernel, an existing-schema change** (ADR 0018, Raymond's review per CLAUDE.md):
  - **`Participant`** gains `diceLook` (nullish, so every old event and snapshot replays unchanged).
  - **New command** `participant.setDiceLook { lookId | null }`.
  - **New command** `participant.clearDiceLook { participantId }` (GM).
  - **New event** `ParticipantDiceLookSet { participantId, look, previous }`.
  - **`DecideContext`** gains a pre-resolved `ownedDiceLook`, so `decide` stays pure.
  - **`reduce`** handles the new event; **`visibility.ts`** marks it public; the activity log and undo skip it.
- **apps/server:**
  - `LiveRoom.submit` resolves the actor's own look (membership, then owner, then look) before `decide`. This is the pre-decide lookup ADR 0004 anticipated.
  - A per-connection rate limit on look changes.
  - Server-side image header checks for dice pictures (`image-size`, pure JS).
  - `nosniff` on `/uploads`.
- **apps/web:**
  - The renderers draw each public roll in its roller's room look.
  - The Dice panel syncs your look to the room.
  - The GM gets "Reset dice to classic" in the participants list.
  - Viewers get a "Show other players' dice looks" setting.
  - Missing pictures fall back to classic.
- **Depends on:** `user-accounts` (O3 and M1), and `dice-image-skins` archived.
- **Not in this change:** animated or 3D-model dice; sharing or gifting looks between accounts; a moderation queue for pictures.

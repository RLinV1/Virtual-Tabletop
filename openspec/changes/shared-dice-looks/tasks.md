# Tasks

## 1. Before building

- [ ] 1.1 Archive `user-accounts` (and, before it, `dice-image-skins`). Verify `openspec validate shared-dice-looks --strict` reports no refused `dice-looks` delta.
- [ ] 1.2 Write `docs/adr/0018-dice-looks-on-the-table.md`: D1 to D3, the pre-decide lookup (naming ADR 0004's note), and the rollback note. Get Raymond's review. Verify the ADR links ADR 0004, 0013 and 0016.

## 2. Kernel (packages/shared)

- [x] 2.1 Add `DiceLookOnTable`, `Participant.diceLook` (nullish), the `participant.setDiceLook` and `participant.clearDiceLook` commands, the `ParticipantDiceLookSet` event, and `DecideContext.ownedDiceLook`. Verify `npm run typecheck`, and that replaying `packages/shared/test/fixtures.ts` logs gives unchanged state.
- [x] 2.2 Handle both commands in `decide` and the event in `reduce` (D2). Verify `packages/shared/test/diceLooksOnTable.test.ts`:
  - own look accepted;
  - another look refused (`ctx` mismatch);
  - `null` accepted with no lookup;
  - a departed actor refused;
  - GM clear of a player accepted;
  - a player clearing another player refused;
  - `previous` carried both ways.
- [x] 2.3 Mark the event and the field public in both visibility filters, and skip the event in `activityLog.ts` and in undo grouping (D3). Verify tests: a player's and the GM's filtered views both carry the look; the payload has no name, email or account id; the event is not undoable and adds no log entry.

## 3. Server

- [x] 3.1 Add the pre-decide lookup in `LiveRoom.submit` (`userForParticipant`, then `findDiceLook` scoped by owner, then `ctx.ownedDiceLook`) and `version` from `updated_at`. Verify `apps/server/test/diceLooksOnTable.test.ts` over Socket.IO:
  - a signed-in member sets their look and the other clients receive it;
  - a guest seat is refused;
  - another account's `lookId` is refused;
  - a late joiner's snapshot carries the look.
- [x] 3.2 Add the 10-per-minute look-change limit per connection. Verify the 11th change within a minute is refused and appends nothing.
- [x] 3.3 Check dice face files with `image-size` (type, real dimensions, a match with the declared ones), and add `nosniff` on `/uploads` (D5). Verify a 4000 × 4000 file declared 512 × 512 gets 400, a renamed GIF gets 415, and the `/uploads` response carries `X-Content-Type-Options: nosniff`.

## 4. Web

- [ ] 4.1 Draw every public roll in its roller's table look, with the browser-look fallback for your own rolls and slate for GM-only rolls (D6). Replace the `skinned` flag. Verify in two browser profiles that a Roll and a drop by Kim show her look on Sam's screen, and that Sam's private roll stays slate.
- [ ] 4.2 Sync the look from the Dice panel and on room entry (D4); show the "sign in and keep your seat to show your dice" note to guests and unkept seats. Verify:
  - choosing a look, editing its d20 and choosing Classic all reach the other profile;
  - a room entered later catches up;
  - a guest sees the note.
- [x] 4.3 Add "Reset dice to classic" for the GM in the participants list, and the viewer's "Show other players' dice looks" setting. Verify the GM reset and the viewer-toggle scenarios in the browser.
- [x] 4.4 Preload face pictures and fall back to classic per die when one fails. Verify that deleting the look in use from another profile makes its dice classic on the table with no broken image.

## 5. Finish

- [ ] 5.1 Update `docs/DICE-SKINS.md` (who sees a look, and the rules for showing it) and DESIGN.md §5 visibility (the dice look is public room data). Verify the links resolve.
- [ ] 5.2 Run `npm run lint && npm run typecheck && npm test`. Verify all clean, and CI passes on the PR.

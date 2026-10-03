## 0. Prerequisites

- [ ] 0.1 Confirm with Antonio (KAN-35 owner, and KAN-32 in progress) who takes this, and agree the merge order with KAN-32; verify the agreement is noted on the KAN-35 ticket
- [ ] 0.2 Confirm KAN-39 (`connection.preview`) is merged into `main` and rebase this branch on it; verify `RoomConnection.preview` exists

## 1. ADR

- [ ] 1.1 Write `docs/adr/00NN-area-lines-and-aim.md` (next free number) amending ADR 0007 for the `line` shape, the optional `width`, and the `templatePreview` payload with its relay rules; get Real-Time Architecture owner sign-off; verify ADR 0007 links to it

## 2. Shared contract

- [ ] 2.1 Add `"line"` to `AreaShape`, optional `width` to `AreaTemplate` and `template.place`, and the `templatePreview` payload to `EphemeralPayload`; replace the "rejects line" test with acceptance tests; verify `npm run typecheck`
- [ ] 2.2 Validate `width` in `decide` (positive, ≤10 cells of the room grid); verify unit tests for 0, 1 cell, 2 cells and 11 cells
- [ ] 2.3 Give lines an activity-log label ("placed a 60 ft line", "10 ft wide" when not one cell); verify with an `activityLog.test.ts` case
- [ ] 2.4 Verify an old `TemplatePlaced` event without `width` still parses and replays (a fixture test)

## 3. Server

- [ ] 3.1 Add the `templatePreview` relay rules in `LiveRoom.relayEphemeral`: drop a player's `gmOnly`, drop off-map or no-map, GM-only delivered to GMs only, volatile delivery; verify with 3.2
- [ ] 3.2 Add `describe("template aim previews (KAN-35, FR-TAC-06)")` to `apps/server/test/areaTemplates.test.ts`: a preview reaches others, takes no seq, and leaves the state unchanged; aim then place yields exactly one `TemplatePlaced` at the next seq; a GM-only preview never reaches a player; a player's forged GM-only preview reaches no one; an off-map preview reaches no one; verify with `npm test --workspace=@vtt/server -- -t "aim previews"`

## 4. Web

- [ ] 4.1 Add the `line` branch to `areaShape()` and line snapping; verify `boardTools.test.ts` cases: 12-cell line on a 5 ft grid = 60 ft, corners at the right offsets for 1- and 2-cell width, Alt keeps a free origin
- [ ] 4.2 Add "Line" to the Area shapes in `ToolRail.tsx` with a 5/10 ft width toggle shown only for lines; verify keyboard focus order and that the toggle has an accessible name
- [ ] 4.3 Send aim previews through `connection.preview("aim", ...)` during an Area drag, and send `null` on place and on Escape; draw received previews dashed with the sender's name, keyed by sender, expiring 1 s after the last update; verify `npm run typecheck` and a unit test of the expiry bookkeeping

## 5. Verification

- [ ] 5.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [ ] 5.2 In Playwright with a GM and a player context: the player aims a cone and the GM sees the dashed preview follow it; the player places it and the GM sees the solid template; the GM aims a GM-only circle and the player sees nothing; a 60 ft line places correctly; take screenshots at desktop and mobile widths
- [ ] 5.3 After KAN-39's benchmark exists, add `templatePreview` to it and confirm p95 ≤150 ms

## 1. Grid editor

- [ ] 1.1 Add a `previewTarget: "board" | "local"` prop and an apply-label prop to `GridForm`; with `"local"`, never call `onChange`/`onGridDraftChange`; verify a component test that editing in local mode does not call `onChange`, and that existing `gridDraft` tests still pass

## 2. Prepare map overlay

- [ ] 2.1 In `MapSection`, replace the commit-on-upload and commit-on-pick paths with a `prep` draft state that opens a Prepare map modal holding `GridForm` (local preview, "Apply map"); verify a component test with a mocked connection: upload and pick send no command
- [ ] 2.2 Apply sends exactly one `scene.setMap { map, grid }` and closes on success; on rejection the overlay stays open with the error and the draft is kept; verify component tests for both
- [ ] 2.3 Close paths (Cancel, Escape, close button, backdrop) discard the draft; when the grid changed, show Keep editing / Discard first; verify component tests for clean and dirty closes
- [ ] 2.4 Add `.prep-sheet` sizing (max 1120 px, 24 px desktop gap, full viewport under 768 px, sticky actions); verify in Playwright at 1280×800 and 390×844 that the actions are reachable without scrolling the page

## 3. Server-side check

- [ ] 3.1 Add a server integration test (`describe("private map preparation (KAN-59)")`): with a GM and a player connected, an `/api/uploads` upload produces no message to the player, and the following `scene.setMap` with a grid yields exactly one event; verify with `npm test --workspace=@vtt/server -- -t "KAN-59"`

## 4. Verification

- [ ] 4.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [ ] 4.2 In Playwright with a GM and a player context: GM uploads a map; the player still sees the old map; GM aligns and applies; the player sees the new map and grid at once; GM uploads again and presses Escape; the player sees no change, and focus is back on Upload map; confirm the GM's socket never disconnects (no new `welcome`) by watching the WebSocket frames; take screenshots

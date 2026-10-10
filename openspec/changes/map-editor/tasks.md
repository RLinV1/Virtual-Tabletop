# Tasks

## 1. Availability

- [x] 1.1 Add `WallDetectionAvailability` to `packages/shared/src/wallDetection.ts`, `WallDetections.availability()` (no queue, or no workers: unavailable; 10 s cache) and `GET /api/wall-detection/availability`; verify with integration tests for a queue with workers, a queue without workers, and no queue.

## 2. Editor

- [x] 2.1 Build `pages/mapEditor/MapEditor.tsx`: the full-screen modal, step tabs, and the Map and Grid steps, moving MapSection's draft state in unchanged; verify typecheck and in the running app.
- [x] 2.2 Build `WallCanvas.tsx` (SVG map, walls, camera, Draw, Erase, Detect like this, Pan) and `WallSetup.tsx` (canvas, side panel with detection status, preview, Apply, Clear and availability); verify in the running app.
- [x] 2.3 Replace Manage › Battle map with the summary and Edit map, and remove the Walls section; update `guide.ts`; verify the guide test.

## 3. Board

- [x] 3.1 Remove the board's Walls tool (`tools.ts` type, `ToolRail.tsx`, `boardView.ts` input, `Board.tsx`, `RoomPage.tsx`), keeping the wall layer; verify lint, typecheck and tests.

## 4. Verification

- [x] 4.1 `npm run lint && npm run typecheck && npm test` and the vision tests pass.
- [x] 4.2 In the running app: with Redis and the worker, set a map, grid and walls in the editor; without them, the detect controls are greyed out with the reason and drawing still works; capture Playwright screenshots.
- [x] 4.3 Update `docs/WALL-DETECTION.md` and the `wall-editing` change so its tool lives in the editor.

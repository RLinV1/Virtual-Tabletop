## 1. Board label

- [x] 1.1 Add `tokenLabelFontSize(radius)` in `apps/web/src/board/tokenLabel.ts` with a floor and ceiling; verify with `apps/web/test/tokenLabel.test.ts`
- [x] 1.2 Use it in `BoardView.drawToken` so the label resizes with token size and cell size

## 2. Token editor

- [x] 2.1 Keep Name and HP/Max/AC visible; move Conditions, Control & visibility and Advanced (X, Y, size, rotation, image) into `<details>` sections that start closed, each with a summary in its header
- [x] 2.2 Add `apps/web/test/tokenEditor.test.tsx`: sections start closed, Advanced holds X/Y/size/rotation/image, players get no GM sections, summaries
- [x] 2.3 Style the sections with one shared gutter; verify in the Playwright MCP as GM (alignment measured) and as a player
- [x] 2.4 Run `npm run lint && npm run typecheck && npm test`

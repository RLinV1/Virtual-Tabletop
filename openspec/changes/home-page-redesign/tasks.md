# Tasks

## 1. One page

- [x] 1.1 Remove the GM-token branch from `HomePage`, delete `Dashboard`, `CreateRoomCard` and `JoinByInviteCard`, and add a `YourRooms` band that renders nothing when there is nothing to show. Verify by clearing storage, opening `/`, following the library link and pressing Back.
- [x] 1.2 Delete the CSS the dashboard orphaned. Verify no `.tsx` still references `.home-grid` or `.card.wide`.

## 2. The page itself

- [x] 2.1 Editorial split hero over a real map, headline at two lines and subtext under 20 words, with the create-room form as the primary action. Verify the headline stays two lines from 380px to 1920px.
- [x] 2.2 Live grid-size control over a real map, starting at the product's own `DEFAULT_GRID.cellSize`. Verify the overlay resizes and the readout matches.
- [x] 2.3 GM/player toggle adding and removing a hidden token. Verify the player view has one fewer token and the caption changes.
- [x] 2.4 Dice box importing `parseDiceExpression` and `rollDice` from `@vtt/shared`, with a throw animation that settles on the engine's result. Verify the shown dice sum with the modifier to the shown total.
- [x] 2.5 Asset library shelf with real dimensions and default grid, plus the browser-bound statement. Verify the link uses the shared control family.
- [x] 2.6 One secondary control family across the header pair, theme toggle, Open, Join and Roll. Verify all six resolve to one border, fill, radius and type size.

## 3. Grounds, motion and images

- [x] 3.1 `theme.ts` with system-preference default, persisted override, and an effect that removes the attribute on unmount so the table is untouched. Verify by opening a room from the light ground.
- [x] 3.2 Lit ground with a per-map bloom, feathered frames and a specular layer. Verify no horizontal overflow at 380px.
- [x] 3.3 All motion behind `prefers-reduced-motion`, using CSS scroll-driven animation rather than a scroll listener. Verify no `animation:` sits outside the guard.
- [x] 3.4 Three distinct maps, one per section, each with its own alt text. Verify three distinct sources load.

## 4. Verify

- [x] 4.1 Contrast measured in both grounds for text and control boundaries.
- [x] 4.2 Zero em-dashes in the rendered page, including the dice parser's error message.
- [x] 4.3 `npm run lint && npm run typecheck && npm test` clean.
- [ ] 4.4 Settle the palette divergence against KAN-65's rust system before merge.

## Why

Attacks and conditions only show up in the panels and the activity log (KAN-76). Nobody watching the board can tell that Aria just swung at the goblin or that the ogre is poisoned without reading a sidebar. Making them read on the board itself keeps the table's attention on the map.

## What Changes

- **Attack animation.** When a live attack roll arrives (`DiceRolled` with `attack`), the board plays a strike travelling from the attacker token to the target token, then a neutral impact on the target. When the GM rules (`RollRuled`): **Hit** plays a flash and shake on the target, **Miss** plays a deflect/whiff. When damage is applied (`RollDamageApplied`): a floating "−N" rises from the target. One built-in default; no customisation.
- **Condition effects.** Each of the 12 conditions gets a fixed, code-defined effect drawn on the token while it is set (e.g. poisoned: green bubbles, frightened: tremble, stunned: circling stars, prone: tilted, invisible: faded shimmer, concentrating: pulsing ring, unconscious: greyed). Users cannot change or turn off individual effects. The existing shape + abbreviation badges (FR-TAC-08) stay exactly as they are; colour and motion are decoration only.
- **Client-only.** Driven by events the client already receives. No new commands, events, persisted state or schema changes, so no ADR.
- **Hidden info.** Animations use only the viewer's filtered state and filtered events: a player never gets an animation for a side that is `null` in their copy (FR-GM-23), and events that reach them only as a resync or a redaction never animate.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, nothing travels or loops: attacks show a brief static marker on the target, and condition effects are drawn as static decoration.
- **Rendering budget.** Looping condition effects mean the board renders continuously while one is on screen. This modifies `client-render-performance` to allow that, capped at 30 fps, stopped when no animated effect is visible, when the tab is hidden, or under reduced motion.

## Non-goals

- Per-token, per-weapon or per-user animation choices; sound.
- Animating snapshots: loading, reloading or a resync never replays past attacks.
- Animating plain (non-attack) dice rolls, or area templates.

## Capabilities

### New Capabilities
- `board-attack-effects`: attack animations and their endings, condition effects, hidden-token safety, reduced motion, and non-interference with input and positions.

### Modified Capabilities
- `client-render-performance`: "Board renders on demand" allows continuous rendering while an animated condition effect is visible, capped at 30 fps.

## Impact

- **`apps/web/src/net/roomConnection.ts`:** a listener for live committed events that were applied (not snapshots), handing the event and the viewer's state after it.
- **`apps/web/src/board/`:** new `effects.ts` (condition effect table and pure timing helpers), attack animation and condition effect layers in `boardView.ts`, wiring in `Board.tsx`.
- **Tests:** vitest unit tests for the pure helpers (which events trigger what, hidden-side suppression, reduced-motion selection) under `apps/web`; Playwright check in the running app at desktop and mobile widths.
- **`packages/shared`, `apps/server`:** no change.

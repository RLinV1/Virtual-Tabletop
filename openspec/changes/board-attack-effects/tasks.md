## 1. Event hook (web net)

- [ ] 1.1 Add `RoomConnection.onCommitted(listener)` returning an unsubscribe, invoked with `(committed, before, after)` only after a live `event` message is reduced successfully — never for `welcome`, `redacted`, or a failed reduce. Verify with a unit test in `apps/web/test/roomConnection.test.ts` (or the nearest existing harness) that a welcome does not call it and an in-order event does (KAN-76).

## 2. Pure effect logic (board/effects.ts)

- [ ] 2.1 Create `apps/web/src/board/effects.ts` with `attackEffectFor(event, after, viewer)` per design Decision 2 and `CONDITION_EFFECTS` as a total `Record<ConditionId, …>` per Decision 5, plus `prefersReducedMotion` helpers. Verify with `apps/web/test/boardEffects.test.ts` (KAN-76, FR-GM-23): strike for a visible attack; null for a null side, a missing token, a player-hidden token, a plain roll, a cleared verdict; hit vs miss; damage amount; every ConditionId has an effect; reduced-motion selection returns static variants.

## 3. Board rendering (board/boardView.ts, Board.tsx)

- [ ] 3.1 Per-token art wrapper and `effects` layer (Decision 4): shake/tilt/greyscale apply to the wrapper; `container.position` untouched; effect graphics `eventMode = "none"`; badges stay on top. Verify `npm run typecheck` and that existing web tests pass.
- [ ] 3.2 Condition effects drawn from `CONDITION_EFFECTS` in `drawToken`, removed when cleared; a single 30 fps loop step registered only while a visible token has a looping effect, the page is visible and motion is allowed (Decision 6); static rest pose under reduced motion. Verify in the running app that setting and clearing Poisoned adds/removes bubbles and the PO badge is unchanged, and that an idle room without conditions renders no frames (Performance panel or a frame counter).
- [ ] 3.3 Attack animations: `BoardView.playAttackEffect(effect)` for strike → impact, hit flash+shake, miss deflect, floating "−N"; effects track token ids and end if a token disappears; max 8 concurrent; reduced-motion static variants (Decision 7). Wire `connection.onCommitted` → `attackEffectFor` → `view.playAttackEffect` in `Board.tsx`. Verify with typecheck/lint and in the running app.

## 4. Integration

- [ ] 4.1 Playwright in the running app at desktop (1280×800) and mobile (390×844) widths with a GM and a player: attack animation plays for both on a visible pair; Hit and Miss endings differ; damage number appears; a hidden attacker produces no animation on the player's board; with reduced motion emulated, no strike travels; dragging a token during a hit effect lands it where dropped. Save screenshots to the scratchpad.
- [ ] 4.2 Run `npm run lint && npm run typecheck && npm test`; run the visibility-auditor agent and a security review on the diff and fix findings.

## 1. Dependencies and scaffolding

- [x] 1.1 Add `framer-motion`, `@tsparticles/react`, `@tsparticles/slim` and `@tsparticles/engine` to `apps/web/package.json` and install
- [x] 1.2 Create `apps/web/src/board/EffectsOverlay.tsx` (React, no Pixi imports): absolutely positioned, `pointer-events: none`, `aria-hidden`, lazy loaded from `Board.tsx`
- [x] 1.3 Subscribe the overlay to the board transform with `followView`; children sit in board coordinates inside a transformed world element (as `ThrownDice` does), so no board-to-screen helper was needed

## 2. Pure presets and plans

- [x] 2.1 Create `effectPresets.ts` mapping condition preset ids and attack kinds to tsparticles options and framer-motion keyframes
- [x] 2.2 Replace `draw` shapes in `CONDITION_EFFECTS` with a `preset` id, keeping `art` and the typed total record; keep `attackEffectFor`, `attackPlan` and `loopingConditions` behaviour and their tests
- [x] 2.3 Add a pure helper ranking tokens for the 12-emitter cap by distance from view centre, with tests
- [x] 2.4 Unit tests: presets exist for all 12 conditions, reduced-motion plans, effect cap of 8

## 3. Attack effects

- [x] 3.1 Strike: glowing projectile with fading trail from attacker to target, then impact spark burst
- [x] 3.2 Hit: flash, expanding ring, sparks; Miss: whiff arc and "Miss" label, visibly different from Hit
- [x] 3.3 Damage: outlined "−N" that pops and rises, then fades
- [x] 3.4 Drop effects older than their plan duration after lazy load; follow a token that moves mid-effect

## 4. Condition effects

- [x] 4.1 tsparticles (`loadSlim`, `fpsLimit` 30, `pauseOnBlur`) with one small canvas per conditioned token, added and removed from the viewer's state (the React wrapper reloads on any options change, so a shared canvas would reset all particles)
- [x] 4.2 Implement the 12 condition presets; poisoned as rising green bubbles with toxic glow
- [x] 4.3 Remove emitters for hidden or absent tokens; unmount the canvas when no emitters exist
- [x] 4.4 Keep art tilt, squash, greyscale, alpha and tremble in `boardView.ts`

## 5. Remove old drawing and integrate

- [x] 5.1 Delete the Pixi projectile, flash and condition decoration drawing from `boardView.ts` and `playAttackEffect`; route `Board.tsx` effects to the overlay
- [x] 5.2 Reduced motion: static markers and static decoration only, no tsparticles mount
- [x] 5.3 Pause on hidden page and when nothing is visible

## 6. Verify

- [x] 6.1 Component tests with tsparticles mocked: `aria-hidden`, `pointer-events: none`, no emitter for hidden tokens
- [x] 6.2 Run `npm run lint && npm run typecheck && npm test`
- [ ] 6.3 Visual check in the running app: attack, Hit, Miss, damage, poisoned, zoom and pan alignment, click-through, at desktop and mobile widths (needs a signed-in GM room; not yet done)

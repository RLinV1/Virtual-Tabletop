## 0. Branch and ADR

- [ ] 0.1 Work on branch `feat/flashy-attack-animations` (off `main`); use conventional commits `type(scope): subject (FR-ID)` throughout; verify `git branch --show-current`
- [ ] 0.2 Write `docs/adr/0038-attack-styles-and-nuke.md` covering `AttackContext.style`, `nuke.detonate`, `MapNuked`, `MapNukeUndone` and the undo rule; get Real-Time Architecture owner sign-off; verify it is linked from `docs/DESIGN.md` if that file lists ADRs

## 1. Shared contract

- [ ] 1.1 Add `AttackStyle` enum and optional `style` to `AttackContext` and the attack roll command; verify an old roll without `style` still parses (fixture test)
- [ ] 1.2 Add `nuke.detonate` command and `MapNuked` / `MapNukeUndone` events; verify `npm run typecheck`
- [ ] 1.3 Handle `nuke.detonate` in `decide`: GM only, `presetRefusal`, amount 1–999, epicenter on the map, one `TokenStatsSet` per token with HP (floor at `MIN_HP`, hidden tokens included), then `MapNuked`; verify unit tests for the "Everyone takes damage", "player cannot nuke", forged amount and "nothing to damage" scenarios
- [ ] 1.4 Handle both events in `reduce`; verify a determinism test
- [ ] 1.5 `visibility.ts`: pass `MapNuked` / `MapNukeUndone` to all viewers unchanged; verify a player's filtered batch lacks the hidden token's stats and contains `MapNuked`
- [ ] 1.6 `undo.ts`: add `MapNuked` to `REVERSIBLE_EVENT_TYPES`, its inverse, and extend `canUndo`; verify undo restores HP and is refused after a later HP edit
- [ ] 1.7 `activityLog.ts`: label "GM detonated a nuke (N)"; verify with an `activityLog.test.ts` case

## 2. Server

- [ ] 2.1 Add `describe("map nuke (FR-TAC-06)")` integration tests (confirm the FR ID against README): GM nuke reaches all clients in one batch, a player's forged command is rejected, a hidden token never leaks to a player, reconnect does not replay; verify `npm test --workspace=@vtt/server -- -t "map nuke"`

## 3. Web: presets and effects

- [ ] 3.1 `npm install pixi-filters --workspace=@vtt/web`; verify `npm run typecheck` with Pixi 8
- [ ] 3.2 `effectPresets.ts`: add zod-validated `ATTACK_STYLE_PRESETS` and `NUKE_PRESET` as plain data; verify a unit test that they parse and contain no functions
- [ ] 3.3 `effects.ts`: `attackEffectFor` returns the style (inferring melee or ranged from distance when unset) and a nuke effect for `MapNuked`; verify unit tests for each style, inference at 1 and 6 cells, hidden-token rules, reload no-replay
- [ ] 3.4 New `board/fx.ts`: slash arc, trailing projectile, charged bolt with burst; blast with `ShockwaveFilter`, `AdvancedBloomFilter`, flash and shake; filters removed on end; reduced-motion variants; wire into `BoardView`; verify filters are gone after the blast and token positions are unchanged
- [ ] 3.5 `EffectsOverlay.tsx`: stop drawing the old DOM strike, keep hit/miss/damage numbers and conditions; add nuke damage numbers from before/after HP of visible tokens; verify existing overlay tests still pass

## 4. Web: UI

- [ ] 4.1 Attack panel: three-way style picker (accessible name "Attack style", none selected by default); verify keyboard focus order and a test that the chosen style is sent
- [ ] 4.2 GM nuke control (GM only): amount field, click-to-set epicenter (default map centre), confirm dialog; verify players never see the control

## 5. Verification

- [ ] 5.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [ ] 5.2 Verify in the running app with the Playwright MCP: each style plays, the nuke plays for GM and a player, a hidden token shows no number, reduced motion variant works, undo restores HP

## 0. Branch and ADR

- [x] 0.1 Work on branch `feat/flashy-attack-animations` (off `main`); use conventional commits `type(scope): subject (FR-ID)` throughout; verify `git branch --show-current`
- [ ] 0.2 Write `docs/adr/0038-attack-styles-nuke-and-animations.md` covering `AnimationDef`, `AttackContext.style` and `animation`, `AttackPreset.animation`, `nuke.detonate`, `MapNuked`, `MapNukeUndone`, the undo rule and the `library_animations` table; get Real-Time Architecture owner sign-off; verify it is linked from `docs/DESIGN.md` if that file lists ADRs

## 1. Shared contract

- [ ] 1.1 Add `AnimationDef` (bounded zod) and `AttackStyle` in `packages/shared`; add optional `style` and `animation` to `AttackContext`, optional `animation` to `AttackPreset`; verify old rolls and attacks without them still parse (fixture test) and out-of-range defs are rejected
- [ ] 1.2 Add `nuke.detonate` (with optional `nuke`-shape animation) and `MapNuked` / `MapNukeUndone` events; verify `npm run typecheck`
- [ ] 1.3 Handle `nuke.detonate` in `decide`: GM only, `presetRefusal`, amount 1–999, epicenter on the map, one `TokenStatsSet` per token with HP (floor at `MIN_HP`, hidden tokens included), then `MapNuked`; verify unit tests for "Everyone takes damage", "player cannot nuke", forged amount, wrong animation shape and "nothing to damage"
- [ ] 1.4 In `decide` for `dice.roll`, copy the actor token's matching named attack animation into `AttackContext.animation` and ignore any client-supplied one; verify "matching attack", "unmatched label" and "forged animation" tests
- [ ] 1.5 Handle both new events in `reduce`; verify a determinism test
- [ ] 1.6 `visibility.ts`: pass `MapNuked` / `MapNukeUndone` to all viewers unchanged; verify a player's filtered batch lacks the hidden token's stats and contains `MapNuked`
- [ ] 1.7 `undo.ts`: add `MapNuked` to `REVERSIBLE_EVENT_TYPES`, its inverse, and extend `canUndo`; verify undo restores HP and is refused after a later HP edit
- [ ] 1.8 `activityLog.ts`: label "GM detonated a nuke (N)"; verify with an `activityLog.test.ts` case

## 2. Server

- [ ] 2.1 Prisma model and migration `0016_library_animations`; verify `prisma validate` and that the migration applies
- [ ] 2.2 `LibraryStore` methods (list, find, create, update, delete, count per owner) in the memory and Postgres stores; verify a shared store test run against the memory store
- [ ] 2.3 Routes `/api/library/animations` (GM-only, owner-scoped, 100 cap, `AnimationDef` validated, 404 for another GM); verify integration tests for "Create and list", "Out-of-range definition", "Another GM's animation", "Player credential rejected"
- [ ] 2.4 Add `describe("map nuke (FR-TAC-06)")` integration tests (confirm the FR ID against README): GM nuke reaches all clients in one batch, a player's forged command is rejected, a hidden token never leaks to a player, reconnect does not replay; verify `npm test --workspace=@vtt/server -- -t "map nuke"`

## 3. Web: animations and effects

- [ ] 3.1 `npm install pixi-filters --workspace=@vtt/web`; verify `npm run typecheck` with Pixi 8
- [ ] 3.2 `effectPresets.ts`: built-in `AnimationDef`s for melee, ranged, magic and the nuke; verify a unit test that each parses as `AnimationDef`
- [ ] 3.3 `effects.ts`: `attackEffectFor` returns the animation (roll animation, else style built-in, else inferred) and a nuke effect for `MapNuked`; verify unit tests for each style, inference at 1 and 6 cells, custom animation precedence, hidden-token rules and reload no-replay
- [ ] 3.4 New `board/fx.ts`: one renderer for every shape (`Graphics`, a blurred additive copy for glow, `ShockwaveFilter`, flash, shake); filters removed on end; reduced-motion variants; wire into `BoardView`; verify filters are gone after a blast and token positions are unchanged
- [ ] 3.5 `EffectsOverlay.tsx`: stop drawing the old DOM strike, keep hit/miss/damage numbers and conditions; add nuke damage numbers from before/after HP of visible tokens; verify existing overlay tests still pass

## 4. Web: UI

- [ ] 4.1 Attack panel: three-way style picker (accessible name "Attack style", none selected by default); verify keyboard focus order and a test that the chosen style is sent
- [ ] 4.2 GM nuke control (GM only): amount field, click-to-set epicenter (default map centre), animation select (built-in or library), confirm dialog; verify players never see the control
- [ ] 4.3 `net/api.ts` client for library animations; verify typecheck
- [ ] 4.4 Library page Animations tab: list with search, create, rename, duplicate, delete, duplicate-from-built-in; verify a component test for list and search
- [ ] 4.5 Animation editor form and preview stage (`board/animationPreview.ts` plus a thin React component) with Play running unsaved values, nothing sent to any room; verify the "Preview unsaved changes", "Preview touches nothing" and "Nuke preview" scenarios
- [ ] 4.6 Attack editors (`AttackListEditor`, creature attacks): pick a library animation for a named attack and copy it in; remove it to restore the style; refuse `nuke` shape; verify "Library edit does not change the attack"

## 5. Verification

- [ ] 5.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [ ] 5.2 Verify in the running app with the Playwright MCP: each style plays, a library animation plays for a player, the nuke plays for GM and a player, a hidden token shows no number, reduced motion variant works, undo restores HP, the editor preview plays unsaved values

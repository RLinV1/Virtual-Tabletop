# Tasks

- [x] 1.1 Add `fog.replace` to `commands.ts` and handle it in `decide` (GM only, net cap, area check, all or nothing); verify with unit tests in `packages/shared/test/fog.test.ts` (FR-GM-17).
- [x] 1.2 Count fog after the undo in `undoConflict`; verify a swap in a full room undoes.
- [x] 2.1 Make `planDraftSave` send one `fog.replace` after wall and portal commands; verify in `apps/web/test/mapDraft.test.ts`.
- [x] 3.1 Write `docs/adr/0032-atomic-fog-replace.md`.
- [ ] 3.2 Real-Time Architecture owner review of ADR 0032.
- [ ] 4.1 Run `npm run lint && npm run typecheck && npm test`.

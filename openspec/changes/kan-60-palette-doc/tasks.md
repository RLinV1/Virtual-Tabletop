## 1. Design doc

- [ ] 1.1 Rewrite the `docs/INTERFACE.md` §11.9 token table from the `:root` block in `apps/web/src/styles.css`; verify every value in the table matches `styles.css` exactly (grep each hex value)
- [ ] 1.2 Replace the §11.9 "Direction" paragraph with the slate-and-rust rationale; verify no "gold" or `#d6a355` remains in `docs/INTERFACE.md`
- [ ] 1.3 Fix the §11.1 correction note so it describes the palette that now ships; verify it no longer says "blue accent" as the current state

## 2. Frontend contract

- [ ] 2.1 Update `docs/FRONTEND-CONTRACT.md` §13.8 rows and contrast notes that assume a gold accent or parchment text; recompute accent-on-ink and text-on-panel contrast from the shipped values and verify the stated ratios with a contrast checker
- [ ] 2.2 Verify `grep -rn "d6a355\|parchment" docs/` returns nothing stale

## 3. Close out

- [ ] 3.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass (sanity check; no code changed)

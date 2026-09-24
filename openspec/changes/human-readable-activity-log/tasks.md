## 1. Shared history

- [x] 1.1 Add additive history schemas and exhaustive pure event formatter; verify all event variants and query validation in FR-REC-01 unit tests.
- [x] 1.2 Add GM-only historical projection with visibility filtering, historical names, search and seq pagination; verify unit tests for deleted tokens, renames and player denial.

## 2. Server and UI

- [x] 2.1 Add room-bound authenticated history GET route; verify integration tests for GM reads, player/foreign credential denial, pagination, malformed queries and old rolls.
- [ ] 2.2 Reuse KAN-65 Modal and add GM room entry point, server player search, refresh and Load older; verify typecheck/build and browser checks of modal keyboard controls and request states.

## 3. Verification

- [ ] 3.1 Validate OpenSpec and run npm run lint, npm run typecheck, npm test; document results and any environment-dependent skipped tests.


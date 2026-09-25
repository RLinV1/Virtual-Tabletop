## 1. Shared history

- [x] 1.1 Add additive history schemas and exhaustive pure event formatter; verify all event variants and query validation in FR-REC-01 unit tests.
- [x] 1.2 Add GM-only historical projection with visibility filtering, historical names, search and seq pagination; verify unit tests for deleted tokens, renames and player denial.

## 2. Server and UI

- [x] 2.1 Add room-bound authenticated history GET route; verify integration tests for GM reads, player/foreign credential denial, pagination, malformed queries and old rolls.
- [x] 2.2 Reuse KAN-65 Modal and add GM room entry point, server player search, refresh and Load older; verify typecheck/build and browser checks of modal keyboard controls and request states.
  - Shipped in #24. Browser check on 2026-09-24 (Playwright, room at seq 114 with 111 rolls and a second player):
    - Enter on "Activity log" opens the modal with focus on Close.
    - It lists 50 entries newest-first ("Mara rolled 1d20: 18 · #114"), and Load older brings it to 100.
    - Tab cycles Close, search, Refresh and Load older inside the dialog. The page behind is inert: a toolbar button can't take focus.
    - Searching "tom" finds "Tomas rolled 1d20: 12" and his join, both older than the first page.
    - An unmatched search shows "No matching activity".
    - A forced 500 shows the inline error, and Refresh recovers.
    - Escape closes the modal and returns focus to "Activity log".
    - A player gets no Activity log control.

## 3. Verification

- [x] 3.1 Validate OpenSpec and run npm run lint, npm run typecheck, npm test; document results and any environment-dependent skipped tests.
  - `openspec validate` is valid, and `npm run lint` and `npm run typecheck` are clean. `npm test`: shared 110 (activityLog 30), server 54 with 8 skipped (activityLog API 3), web 71.
  - The 8 skipped server tests are the Postgres-backed store contract suites (`libraryStore`, `postgresStore`). They need a Postgres test database and are environment-dependent.


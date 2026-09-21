## What
<!-- One or two sentences. -->

Implements: FR-

## How it works
- Commands / events added or changed:
- Authorization rule:
- Visibility rule (what players can't see):

## Checklist
- [ ] `npm run typecheck && npm test` pass
- [ ] Multi-client integration test covers convergence
- [ ] No state mutation outside `reduce`; events carry replaced values (undo-ready)
- [ ] Hidden data filtered in snapshots, events, and REST (if applicable)
- [ ] Schema change to existing contract? → ADR linked:
- [ ] UI: keyboard-accessible, not color-only (WCAG 2.2 AA)

# Tasks

## 1. Shared upload and library persistence
- [x] 1.1 Add ADR 0043 and spec-driven proposal/design/scenarios.
- [x] 1.2 Share the bounded UVTT upload reader, validator pool and image storage helpers.
- [x] 1.3 Add account-authorized immediate library import and single-write complete map persistence.
- [x] 1.4 Verify real-file import, phase/metadata preservation, ownership, session expiry, limits and cleanup.

## 2. Room/library integration
- [x] 2.1 Honor the room editor library-saving option with correct ownership and retention.
- [x] 2.2 Resolve library geometry inside the room FIFO and record one reversible composite map event.
- [x] 2.3 Remove client sequential geometry copying and verify two GM/two player filtering, failed append, exact undo and reload.
- [x] 2.4 Accept library UVTT uploads, open the shared editor, show warnings, and verify edits/retry and image-only token art.

## 3. Verification and handoff
- [x] 3.1 Pass strict OpenSpec validation, lint, typecheck, full tests/latency, build and health smoke; record exact results in verification.md.
- [x] 3.2 Record the manual library/room/undo/export browser checklist in verification.md; browser execution remains with the user.
- [ ] 3.3 Obtain Raymond Lin's architecture review of ADR 0043; no approval is asserted.

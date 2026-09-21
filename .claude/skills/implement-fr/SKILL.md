---
name: implement-fr
description: Implement a functional requirement from README.md end-to-end (contract, server, client, tests) following the project's event-model workflow. Use when asked to implement an FR ID like FR-PL-02 or FR-TAC-05.
---

# Implement a functional requirement

Argument: an FR ID (e.g. `FR-TAC-05`). If missing, ask for one.

## 1. Understand (no code yet)
- Find the FR in `README.md` (the spec), plus related NFRs (§6), testing notes (§8), and its milestone (§12).
- Read `CLAUDE.md`, `docs/DESIGN.md` (its slice plan and traceability table), and `docs/adr/0001-event-model.md`.
- If the change is non-trivial or touches shared design, check whether the team wants it proposed via OpenSpec (`/opsx:propose`) first.
- Look at how a similar existing feature is built (e.g. `token.move` → `TokenMoved`).

## 2. Plan — then STOP for approval
Present:
- Commands and events to add or change (exact schema shapes), and whether each is persisted or ephemeral.
- Authorization rule and visibility rule for each.
- Files to touch in `packages/shared`, `apps/server`, `apps/web`.
- Tests that will prove the FR, mapped to its acceptance criteria.
- Any change to an existing schema → flag it: needs an ADR and team review.

Wait for the user to approve the plan.

## 3. Tests first
- `packages/shared/test`: `decide` (allowed + forbidden cases) and `reduce`.
- `apps/server/test`: multi-client test — convergence, authorization, and (if hidden info) no leak in `rawLog`.
- Run them and confirm they fail for the right reason.

## 4. Implement
Order: shared schemas → `decide` → `reduce` → visibility filters → server wiring (if any) → web UI.

## 5. Verify
- `npm run lint && npm run typecheck && npm test` must pass.
- Run the `sync-reviewer` subagent; run `visibility-auditor` if any hidden data is involved. Fix findings.
- If UI changed, run `npm run dev` and exercise the flow in two browser origins (e.g. `localhost:5173` for GM and `127.0.0.1:5173` for a player — they have separate localStorage).

## 6. Hand off
Summarize what changed, test results, and open questions. Suggest a PR title: `FR-XXX: <short description>`. Do not commit or push unless asked.

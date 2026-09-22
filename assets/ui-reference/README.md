# UI Reference

Visual direction for the VTT interface. The written specification lives in
[`../../docs/DESIGN.md`](../../docs/DESIGN.md) §11 — that is the source of truth for pages,
tokens and states. This directory is for the boards.

**None of the boards below exist yet.** They were planned and never produced, and §11 used
to reference them as though they did.

| File | Covers | Status |
| --- | --- | --- |
| `room-setup.png` | GM flow: map upload → grid alignment → tokens & access → invite | Not made |
| `at-the-table.png` | GM vs player table, dice, reconnect states, narrow-screen player layout | Not made |
| `between-sessions.png` | Room hub, guest join, checkpoints, settings, error states | Not made |

## Palette

Defined in `docs/DESIGN.md` §11.5, not here, so the two cannot drift apart again. The
shipped values in `apps/web/src/styles.css` are currently the older neutral-and-blue set
and do not yet match §11.5 — reconciling them is open work.

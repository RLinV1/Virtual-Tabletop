## Why

KAN-60 asks for one palette, stated the same way in the code and the design doc. The code has settled: `apps/web/src/styles.css` ships a cool slate ground with a single rust accent (`--accent: #b9582f`) and tabular figures for changing numbers. The doc has not: `docs/INTERFACE.md` §11.9 still specifies a gold accent (`#d6a355`) with different ground, panel and text values, and the §11.1 note still says the shipped accent is blue. `docs/FRONTEND-CONTRACT.md` §13.8 adopts §11.9 by reference, so the contract points at values nobody ships.

## What Changes

- Rewrite the §11.9 token table in `docs/INTERFACE.md` to the values in `styles.css` (`--bg`, `--panel`, `--raised`, `--border`, `--border-strong`, `--text`, `--muted`, `--accent`, `--accent-ink`, `--focus`, `--ok`, `--warn`, `--danger`), keeping the one-accent and status-colour rules.
- Replace the §11.9 "Direction" paragraph's gold wording with the slate-and-rust rationale already in the `styles.css` header comment.
- Fix the §11.1 correction note so it no longer says the shipped accent is blue.
- Update `docs/FRONTEND-CONTRACT.md` §13.8 where it names gold or parchment ("never parchment text on gold", "parchment on accent 1.76:1") so it matches the rust accent and its measured contrast.
- No code changes. `styles.css` is the source of truth for the values.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Docs only, no behaviour change (`skip_specs: true`).

## Impact

- `docs/INTERFACE.md` §11.1 and §11.9
- `docs/FRONTEND-CONTRACT.md` §13.8
- Closes KAN-60 once merged.

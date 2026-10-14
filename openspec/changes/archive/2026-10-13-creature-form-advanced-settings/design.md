# Design

## Context

`CreatureForm` (`apps/web/src/pages/LibraryCreatures.tsx`) is used by the library's New/Edit creature modal (`LibraryPage.tsx`) and by Save as creature in the token editor (`TokenRoster.tsx`, with a `prefill`). Add Token (`panels/AddToken.tsx`) already has the section to copy: `<details className="add-token-advanced"><summary>Advanced settings</summary>`, with a nested `<details className="add-token-conditions" open={conditions.length > 0}>` whose summary lists `conditionSpec(c).label`. The styles for both exist in `styles.css`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- The same markup and styles as Add Token, so the two forms look and behave alike.
- The section is open whenever it holds a set value or a visible error, and never closes under the GM.

**Non-Goals:**
- Changing Add Token, including making its Advanced settings open on its own.
- A shared Advanced-settings component. Two copies of a few lines don't need one yet.

## Decisions

- **Keep the open state in React, and only ever open it automatically.** Use `const [advancedOpen, setAdvancedOpen] = useState(from?.hp != null || (from?.conditions.length ?? 0) > 0)`, render `<details open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>`, and set it to true when the "Starting HP cannot exceed Max HP" hint appears.
  - *Rejected:* working out `open` on every render from the current values. Clearing Starting HP while typing would then snap the section shut under the cursor, and React would also fight the GM's own toggle.
  - *Rejected:* an uncontrolled `<details>` with a one-time `open` attribute. That can't open the section for the error later.
- **Open for the error when it shows, not at submit time.** The hint already appears as soon as the values are invalid and the form has been touched (`touched && hint`), and Create is disabled. So the section opens as soon as the error is visible, using the same condition. It is checked during render, not in an effect: `if (hpHint && !advancedOpen) setAdvancedOpen(true)`, React's "adjust state while rendering" pattern. That way the first paint never shows a closed section next to the error.
- **The nested conditions section stays uncontrolled, as in Add Token** (`open={conditions.length > 0}`). Its `open` only changes when the GM picks or clears a condition inside it, so it can't collapse while hidden.
- **Grid:** the stat row uses `token-setup-grid token-setup-grid-3`. Inside the section, Starting HP is a plain label with its hint below it.
- **Colour doesn't count as "set".** Every creature has a colour (default `DEFAULT_TOKEN_COLOR`), so counting it would always open the section.

## Risks / Trade-offs

- [A GM can't see a creature's colour at a glance when there's no art] → The image preview (`TokenPreview`) uses the colour when art is chosen, and the Creatures tab list still shows the colour disc. The colour is a rarely changed fallback.
- [The existing `creatureForm.test.tsx` matches exact HTML for the Starting HP input] → A closed `<details>` still renders its children, and the input's attributes don't change, so the test is expected to pass unchanged. Task 2.1 confirms this.

# Design

## Context

See proposal.md for the motivation. The pieces this design builds on:

- **`group.assign { groupId: Id | null, tokenIds }`** already moves tokens between groups. It is GM-only on the server, undoable, and players only see the sequence number advance. The token editor's Group field sends it today.
- **`TokenRoster`** renders the GM's list through `groupedTokens(state, tokens)`. That gives one `<section className="roster-group">` per group in creation order, then Ungrouped. Each section has its own `ul.roster` (`overflow-y: auto`, max 22rem). The headings come from `GroupHeading` or `CollapseToggle`. A collapsed section renders its heading only.
- **`ui/Popover.tsx` (`PopoverButton`)** backs the More, Participants and Share menus. Its panel is `position: absolute` under the button and closes on Escape, a second click, or a press outside. Inside a roster list that scrolls, an absolute panel would be cut off.
- **No drag-and-drop code or library** exists in `apps/web`.

## Goals / Non-Goals

**Goals:**
- The menu and drag both go through one function that sends one command.
- The menu is never cut off by the scrolling list it opens from.
- Keyboard users keep their place after a move.

**Non-Goals:**
- A general drag-and-drop framework, or a new dependency.
- Moving several tokens at once, or ordering tokens inside a group.

## Decisions

### One `moveToGroup` in `TokenRoster`
`moveToGroup(tokenId, groupId | null)`:
- returns early when `(state.tokenGroups[tokenId] ?? null) === groupId`;
- otherwise sends `group.assign { groupId, tokenIds: [tokenId] }` through the roster's existing `send`, so a rejection appears in the roster's error line.

Nothing changes on screen until the server answers. The row moves when the event is reduced, like every other roster change.

### The handle is the menu button and the drag source
`GroupMoveMenu` renders a `PopoverButton` whose button is the grip. The button has a `DotsSixVertical` icon from Phosphor, already a dependency, with `aria-label="Move <name> to group"`. The same button has `draggable`. A click opens the menu, and a drag past the browser's threshold starts dragging instead. Using one control keeps the row from gaining two controls.

The handle sits at the start of the row, before the name button. That keeps it away from Edit and Duplicate, and its position tells people it can be dragged.

*Alternative considered:* making the whole row draggable. Rejected by the user, because clicks on the name, Edit and Duplicate would turn into drags.

### `PopoverButton` grows two small options
These are additive and opt-in, so existing callers are unchanged:
- **`buttonProps`:** extra attributes for the button, used here for `draggable`, `onDragStart` and `onDragEnd`.
- **`placement: "fixed"`:** when the panel opens, read the button's `getBoundingClientRect()` and position the panel with `position: fixed`, flipping it above the button when there isn't room below. Close it when any element scrolls or the window resizes, so the panel never drifts away from its row. This keeps the menu from being cut off by the list's `overflow`.

*Alternative considered:* the HTML `popover` attribute with CSS anchor positioning. It's cleaner, but anchor positioning isn't in every browser we support, and it would be the only use of it in the app.

*Alternative considered:* an inline list that expands under the row. It's never cut off, but it pushes rows around and doesn't look like the app's other menus.

### Menu content
The menu shows a heading "Move <name> to", then a list of buttons:
- one per group in `state.groups` order (creation order, the same as the roster headings);
- then **Ungrouped**.

The current entry has `aria-current="true"` and `disabled`, and a check mark. Choosing an entry calls `close()`, then `moveToGroup`. Tab and Shift+Tab move between entries, which matches the More menu. Escape closes the menu and returns focus to the handle, which `PopoverButton` already does.

### Drag state lives in React
`TokenRoster` holds `dragging: string | null` (a token id) and `dropTarget: string | null`. Ungrouped uses `""` as its key, the same key the collapse state uses.

- **Handle `onDragStart`:** sets `dragging`, sets `dataTransfer.effectAllowed = "move"`, and calls `setData("text/plain", name)` so Firefox starts the drag.
- **Each `section.roster-group`:**
  - `onDragOver`: when `dragging` is set, `preventDefault()` and set `dropTarget` to this section;
  - `onDragLeave`: clear `dropTarget` only when the pointer leaves the section itself (`relatedTarget` is outside it);
  - `onDrop`: `preventDefault()`, then `moveToGroup(dragging, groupId)`, then clear both.
- **Handle `onDragEnd`:** clears both. This covers Esc and drops outside any section.

The section with `dropTarget` gets a `drop-target` class (accent outline and tint). Browsers hide `dataTransfer` data during `dragover`, so reading it there wouldn't work; React state also makes the drag test straightforward in jsdom, which has no real `DataTransfer`.

### Focus follows the moved token
When a token's group changes, its row moves to another section, and React builds it again, so focus on the handle is lost. Before sending, the menu path records `refocus = tokenId`. A `useEffect` on `state.tokenGroups` then focuses `[data-move-handle="<tokenId>"]` once the row exists in its new section, and clears `refocus`.

If the new section is collapsed, the handle isn't on screen. Focus goes to that section's heading toggle instead, so keyboard users land near where the token went. Drags don't move focus.

### Visibility of the handle
`GroupMoveMenu` is rendered only when `isGm && Object.keys(state.groups).length > 0`. Players get the flat list as before, and never receive group data anyway.

## Risks / Trade-offs

- **The menu sits outside the scrolling list but closes on scroll.** Scrolling the sidebar with the menu open closes it, so the user has to reopen it. This is accepted as simpler and safer than following the row.
- **Native drag is unreliable on touch screens.** The menu covers touch, and tests check the menu on its own.
- **Long groups:** each list scrolls separately, so the headings stay in view as targets. Browsers scroll the sidebar automatically while dragging near its edge. Check this by hand in Chrome and Firefox.
- **A browser's click-versus-drag threshold differs slightly by browser.** A tiny drag could start a drag instead of opening the menu. That's harmless: dropping it back on its own group sends nothing.
- **Stale target if the group is deleted mid-drag:** the drop sends `group.assign` for a group that no longer exists, the server rejects it, and the roster shows the error. Nothing is half-applied.

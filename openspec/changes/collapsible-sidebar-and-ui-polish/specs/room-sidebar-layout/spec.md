# Spec Delta

## Purpose

Lets any room participant collapse the side panel, or individual sections of it, to give the board more room, remembers that preference on their device only, and keeps the room page consistent, accessible and usable from phone to wide desktop.

## ADDED Requirements

### Requirement: Collapsible sidebar
On the desktop layout, the room page SHALL provide a toggle that collapses the side panel completely and expands it again. The toggle SHALL be a handle vertically centred on the panel's inner (board-facing) edge. While collapsed, no part of the panel SHALL remain: the board SHALL occupy the full width and the handle SHALL sit vertically centred at the right edge of the viewport, over the board.

#### Scenario: Collapse gives the board the space
- **WHEN** a participant activates the sidebar toggle while it is expanded
- **THEN** the whole panel disappears, the board spans the full width, and only the handle remains, centred on the right edge

#### Scenario: Expand restores the panel
- **WHEN** the participant activates the toggle again
- **THEN** the panel content is shown again with each section in the state it had before

### Requirement: Board view is undisturbed by layout changes
Collapsing or expanding the sidebar or any section SHALL NOT change the board's zoom level, its pan position relative to the map, or the selection and drag state of any token, and SHALL NOT recreate the board canvas.

#### Scenario: Zoom and pan survive a toggle
- **WHEN** a viewer has zoomed and panned the board manually and then toggles the sidebar
- **THEN** the map point at the centre of the viewport before the toggle is still at the centre afterwards, and the zoom level is unchanged

#### Scenario: Auto-fit still follows
- **WHEN** the viewer has never zoomed or panned and toggles the sidebar
- **THEN** the board refits the map to the new width, as it does for a window resize

### Requirement: Collapsible panel sections
Every section in the side panel SHALL have a heading control that collapses and expands that section's body. Collapsing a section SHALL NOT unmount state a participant would lose visibly (in-progress form input MAY be kept by hiding rather than unmounting).

#### Scenario: Collapse one section
- **WHEN** a participant collapses "Dice"
- **THEN** only the Dice body is hidden, its heading stays visible, and other sections are unchanged

#### Scenario: Role-specific sections
- **WHEN** a player views the panel
- **THEN** no GM administration sections are rendered, collapsed or otherwise (unchanged from today)

### Requirement: Participants on demand
The side panel SHALL NOT show the participant list as a section, on either the desktop or the phone layout. Instead the room page SHALL show a participants icon button with the number of participants at the top left of the board, beside the Fit control, on every layout and whether or not the sidebar is collapsed. Activating it SHALL open a popover listing every participant's display name, with the GM marked by text rather than colour alone. The popover SHALL close on Escape, on activating the button again, and on a click outside it, and focus SHALL return to the button when it closes by keyboard. Opening it is client-side only, like collapse state.

#### Scenario: No participants section
- **WHEN** anyone views the room page at any width
- **THEN** there is no "Participants" section in the side panel or its tabs

#### Scenario: Open the list
- **WHEN** a participant activates the participants button showing "3"
- **THEN** a popover lists the three display names with "GM" beside the GM, and the button has `aria-expanded="true"`

#### Scenario: Close with Escape
- **WHEN** the popover is open and the user presses Escape
- **THEN** it closes and focus is on the participants button

#### Scenario: Reachable while collapsed
- **WHEN** the sidebar is collapsed
- **THEN** the participants button is still at the top left of the board and opens the same list

#### Scenario: Live updates
- **WHEN** someone joins while the popover is open
- **THEN** the count and list update without reopening it

### Requirement: Share invite from the header
The invite link SHALL NOT be a section in the side panel. For the GM, the panel header SHALL show a "Share" button at its top right, on the same row as the room name. Activating it SHALL open a popover containing the invite link in a read-only field and a Copy control, with the same close behaviour as the participants popover (Escape, second activation, click outside; focus returns to the button on Escape). Players SHALL NOT see the button, as today they do not see the invite section.

#### Scenario: GM shares the room
- **WHEN** the GM activates Share and then Copy
- **THEN** the invite link is copied and the control reads "Copied" briefly

#### Scenario: No invite section
- **WHEN** the GM views the side panel
- **THEN** there is no "Invite players" section, and the Share button is at the top right of the header

#### Scenario: Players do not get Share
- **WHEN** a player views the room
- **THEN** no Share button is rendered

### Requirement: Guided tour on demand
The room page SHALL show a "Guide" button in the board toolbar, available at any time to every participant. Activating it SHALL start a step-by-step tour that dims the page and spotlights one area at a time with a short explanation card showing the step position ("3 of 9"), Back, Next (Done on the last step) and a Skip all control that ends the tour from any step. Steps SHALL depend on role: the GM tour covers sharing, the battle map, the grid, initiative, the Tokens section and adding tokens, dice and hiding the sidebar; the player tour covers the map, their own tokens, their turn, the roster, dice and hiding the sidebar. Steps whose target is not on screen (for example a GM section for a player, or a panel in another phone tab) SHALL be skipped. Starting the tour SHALL expand a collapsed sidebar. The tour SHALL be client-side only and send nothing to the server.

#### Scenario: GM tour includes setup
- **WHEN** the GM starts the guide
- **THEN** the steps include Share, Battle map, Grid, Tokens and Add tokens

#### Scenario: Player tour excludes GM tools
- **WHEN** a player starts the guide
- **THEN** no step refers to a GM-only control, and the steps include My tokens and Dice

#### Scenario: Spotlight follows the area
- **WHEN** the tour moves to a step whose area is scrolled out of the panel
- **THEN** the area is scrolled into view and the spotlight and card sit on it

#### Scenario: Keyboard use
- **WHEN** the tour is open
- **THEN** focus is inside the card, Tab stays within it, the arrow keys or Next and Back move between steps, and Escape closes it and returns focus to the Guide button

#### Scenario: Collapsed sidebar
- **WHEN** the sidebar is collapsed and the guide is started
- **THEN** the sidebar expands so its steps can be shown

### Requirement: GM setup forms open in modals
Forms that are filled in occasionally and then dismissed SHALL open in modals rather than sit open in the side panel; controls used every turn (dice roller, turn order, roster) SHALL stay inline. Specifically: "Add token" at the bottom of the Tokens section, "Adjust grid" and "From library" in the Battle map section, "From library" inside Add token (stacked over it), "Start encounter" in Initiative (the per-token score entry), "Edit" on a roster row, and "Roll history" in Dice. The GM's token controls (add, owner, visibility, delete, stats, conditions) SHALL all live in the Tokens section, with no separate Manage tokens section, and no token SHALL be listed twice in the side panel. Each SHALL open a modal dialog with a title, the existing form, and a close control. The modal SHALL trap focus, close on Escape, on the close control and on a click on the backdrop, and return focus to the button that opened it. A successful submit SHALL close the modal; a rejected one SHALL keep it open and show the error inside it.

#### Scenario: Add a token from the modal
- **WHEN** the GM presses Add token, fills in a name and submits
- **THEN** the token is created and the modal closes with focus back on Add token

#### Scenario: Rejected grid
- **WHEN** the GM applies a grid the server rejects
- **THEN** the modal stays open and shows the reason

#### Scenario: Roll history search
- **WHEN** someone opens Roll history and types part of a player's name
- **THEN** only that player's rolls are listed, with a count, and an empty message when none match

#### Scenario: Escape from a search field
- **WHEN** focus is in a modal's search field and Escape is pressed
- **THEN** the modal closes (only the top one, when modals are stacked)

#### Scenario: One list of tokens
- **WHEN** the GM views the side panel before an encounter
- **THEN** each token name appears once, in Tokens, and initiative scores are entered in the Start encounter modal

#### Scenario: Dismiss without saving
- **WHEN** the GM opens Adjust grid and presses Escape
- **THEN** the modal closes, nothing is sent, and focus is on Adjust grid

### Requirement: Collapse state is client-side only
Sidebar and section collapse state SHALL be stored only in the participant's browser, keyed per browser and not per room state. It MUST NOT be sent to the server, MUST NOT create a command, event or ephemeral message, and MUST NOT affect other participants. The page SHALL work with defaults when browser storage is unavailable.

#### Scenario: Remembered after reload
- **WHEN** a participant collapses the sidebar and Initiative, then reloads the page
- **THEN** the sidebar and Initiative are still collapsed

#### Scenario: No network traffic
- **WHEN** a participant toggles any collapse control
- **THEN** no socket message and no HTTP request is sent

#### Scenario: Storage unavailable
- **WHEN** reading or writing browser storage throws
- **THEN** the page renders with the default (expanded) state and the toggles still work for the current visit

#### Scenario: Corrupt stored value
- **WHEN** the stored value is not valid for the expected shape
- **THEN** it is ignored and defaults are used

### Requirement: Keyboard and assistive-technology access
The sidebar toggle and every section heading control SHALL be native buttons operable with Enter and Space, SHALL expose `aria-expanded`, and SHALL reference the region they control with `aria-controls`. Focus SHALL be visibly indicated. When the sidebar collapses while focus is inside it, focus SHALL move to the toggle. Collapse and expand animation, if any, SHALL be disabled under `prefers-reduced-motion: reduce`.

#### Scenario: Keyboard toggle
- **WHEN** a keyboard user focuses the sidebar toggle and presses Enter or Space
- **THEN** the sidebar toggles and `aria-expanded` reflects the new state

#### Scenario: Focus not lost
- **WHEN** the sidebar collapses while a control inside it has focus
- **THEN** focus moves to the toggle rather than to the document body

#### Scenario: Collapsed content is inert
- **WHEN** the sidebar or a section is collapsed
- **THEN** its controls are not reachable by Tab and are not exposed to screen readers

#### Scenario: Skip link still works
- **WHEN** the sidebar is collapsed and the user follows "Skip to room controls"
- **THEN** the sidebar expands and focus lands on the panel

### Requirement: Consistent presentation
All panel sections SHALL share one heading style, spacing scale and type scale, drawn from shared CSS tokens, including the GM administration sections. Status and state SHALL NOT be conveyed by colour alone.

#### Scenario: GM sections match play sections
- **WHEN** a GM views the panel
- **THEN** the "Invite players", "Battle map" and other GM sections use the same heading control and spacing as "Initiative" and "Dice"

### Requirement: Responsive layout
The room page SHALL remain usable, without horizontal page scrolling, at widths from 320px to at least 2560px. At 720px and below, the existing tabbed phone layout SHALL apply and the sidebar toggle SHALL NOT be shown. Between 721px and about 1024px the panel SHALL be narrower than on wide screens so the board keeps the majority of the width.

#### Scenario: Phone layout unchanged
- **WHEN** the viewport is 390px wide
- **THEN** the board is above the tabbed panel as before and there is no sidebar toggle

#### Scenario: Laptop width
- **WHEN** the viewport is 1024px wide with the sidebar expanded
- **THEN** the panel does not take more than about a third of the width and its content does not overflow horizontally

#### Scenario: Crossing the breakpoint
- **WHEN** the window is resized from desktop to phone width while the sidebar is collapsed
- **THEN** the tabbed panel is fully visible (collapse applies only to the desktop layout) and returns to collapsed when widened again

# room-ui-refinements Specification

## Purpose
TBD - created by archiving change fix-sidebar-tour-and-render-performance. Update Purpose after archive.

## Requirements

### Requirement: Sidebar handle responds to a normal click
The sidebar handle SHALL toggle the sidebar on every click, however long the mouse button is held, both when collapsing and when expanding. Its position SHALL NOT change while it is pressed, apart from the shared 1 px press offset.

#### Scenario: Human-speed click reopens the sidebar
- **WHEN** the sidebar is collapsed and the viewer presses the handle for 300 ms and releases
- **THEN** the sidebar expands on that single click

### Requirement: Tour spotlight is usable when the step asks for it
A guided-tour step that asks the viewer to use the highlighted control SHALL let pointer input reach that control while the rest of the page stays blocked. The spotlight SHALL follow the control when a layout transition moves it. The sidebar-handle step SHALL be such a step.

#### Scenario: Hide the sidebar from the tour
- **WHEN** the tour is on the "More room" step and the viewer clicks the highlighted sidebar handle
- **THEN** the sidebar collapses, the spotlight moves to the handle's new position, and clicking the handle again expands it

#### Scenario: Other steps stay non-interactive
- **WHEN** the tour is on any other step and the viewer clicks inside the spotlight
- **THEN** nothing on the page is activated

### Requirement: Compact activity-log refresh
The activity log's refresh control SHALL be an icon-only button on the search row, with an accessible name of "Refresh" and a tooltip. It SHALL be disabled while a request is in flight. It SHALL NOT sit between the search field and the entries as a full-width button.

#### Scenario: Refresh by icon
- **WHEN** the GM activates the refresh icon
- **THEN** the log reloads from the newest entry, and the icon is disabled until the request finishes

#### Scenario: Screen reader name
- **WHEN** a screen reader focuses the refresh control
- **THEN** it is announced as "Refresh, button"

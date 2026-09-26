## MODIFIED Requirements

### Requirement: The GM manages access from the room UI
In the room, the GM SHALL see a remove action for each active player in the participants list. The GM SHALL see one Share control at the right end of the room's top bar. It SHALL be visible whether the sidebar is shown or hidden. The Share control's main button SHALL copy the current invite link with one click. The control SHALL also offer a menu, attached to it, with a "Reset link" action that clears the current link and makes a new one. Reset SHALL NOT be a separate panel tab or a separate top-bar button. Remove and Reset link SHALL both ask for confirmation before they take effect, and the remove confirmation SHALL name the player. The invite link copied SHALL be the server's current code, not a copy cached in the browser. Players SHALL NOT see the Share control or the remove action. A revoked guest SHALL see a session-ended screen that says they were removed from the room. The browser SHALL forget its credentials for that room.

#### Scenario: Removing a player from the list
- **WHEN** the GM chooses Remove next to "Sam" and confirms
- **THEN** Sam disappears from everyone's participant list

#### Scenario: Revoked guest's screen
- **WHEN** a guest is revoked while in the room
- **THEN** their page says they were removed from the room, and reloading the page does not reconnect them

#### Scenario: Share copies the current link after a reset elsewhere
- **WHEN** the GM resets the invite in one tab and then clicks Share in another tab
- **THEN** the link the second tab copies contains the new invite code

#### Scenario: Share sits at the top right
- **WHEN** the GM opens a room, with the sidebar shown or hidden
- **THEN** the Share control is the last item at the right end of the top bar, and the sidebar header has no Share control

#### Scenario: Clearing the link from the Share menu
- **WHEN** the GM opens the Share control's menu, chooses Reset link, and confirms
- **THEN** the old invite link stops working, a new one is issued, and no panel tab was opened or changed

#### Scenario: Players see no Share control
- **WHEN** a player opens the room
- **THEN** the top bar has no Share control

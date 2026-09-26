# room-access Specification

## Purpose

Lets the GM control who can get into a room: remove a participant for good, and replace a leaked invite link without disturbing the people already playing.

## Requirements

### Requirement: GM can revoke a player
The GM SHALL be able to revoke any active player in the room. The server SHALL make this decision. The server SHALL reject a revoke request with `forbidden` when the sender is not the GM. It SHALL reject it with `invalid` when the target is a GM, is the sender, or is no longer active because they were revoked or left. It SHALL reject it with `not_found` when the target is not a participant in the room. A rejected revoke SHALL NOT append any event. An accepted revoke SHALL append exactly one event. That event SHALL record the participant as they were before, and it SHALL NOT change any token.

#### Scenario: GM revokes a player
- **WHEN** the GM sends a revoke for player "Sam"
- **THEN** one `ParticipantRevoked` event is appended, and every client in the room sees that Sam is no longer an active participant

#### Scenario: Player tries to revoke someone
- **WHEN** a player sends a revoke for another player
- **THEN** the command is rejected with `forbidden` and no event is appended

#### Scenario: GM targets a GM or an inactive participant
- **WHEN** the GM sends a revoke for themselves, for a player who is already revoked, or for a player who left
- **THEN** the command is rejected with `invalid` and no event is appended

### Requirement: A revoked participant is disconnected and cannot come back with their credential
When a participant is revoked, the server SHALL send each of their open connections a session-ended message with the reason `revoked`, and SHALL then close the connection. After that, the participant's stored credential SHALL NOT open a socket connection to the room and SHALL NOT authorize any room REST request. This SHALL hold after a server restart. The server SHALL reject commands from the revoked participant with `forbidden` and SHALL drop their ephemeral messages.

#### Scenario: Revoked guest is kicked out live
- **WHEN** player "Sam" is connected from two tabs and the GM revokes Sam
- **THEN** both tabs receive a session-ended message with the reason `revoked` and are disconnected, and other participants stay connected

#### Scenario: Revoked guest token no longer rebinds
- **WHEN** a revoked guest's browser reconnects with its stored guest token
- **THEN** the connection is refused with `revoked`, and the guest does not receive a snapshot or any event

#### Scenario: Revocation survives a restart
- **WHEN** the server restarts after a revocation and loads the room from storage
- **THEN** the revoked guest's token is still refused

### Requirement: A revoked participant's tokens return to GM control through the departure review
Revoking SHALL leave every token unchanged. Tokens that name the revoked participant as an owner SHALL keep that owner entry until the GM resolves them. Only the GM and any other active owners SHALL be able to control those tokens. The GM SHALL resolve those tokens with the same per-token review used for players who left: reassign, unassign, delete, or decide later. The server SHALL accept `participant.resolveDeparture` for a revoked participant under the same rules as for one who left. In the GM's list of players to resolve, the revoked participant SHALL be labeled as removed, not as left. When the GM confirms a revoke from the room page and the participant owned at least one token, the review for that participant SHALL open.

#### Scenario: Solely owned token is GM-only after revocation
- **WHEN** player "Sam" is the only owner of token "Rogue" and the GM revokes Sam
- **THEN** "Rogue" is unchanged on the board, Sam cannot move it, the GM can move it, and the GM's list of players to resolve shows Sam as removed with 1 token

#### Scenario: Shared token keeps its other owner working
- **WHEN** "Wolf" is owned by Sam and Alex and the GM revokes Sam
- **THEN** Alex can still move "Wolf"

#### Scenario: GM reassigns the revoked player's token
- **WHEN** the GM reviews Sam's tokens after revoking Sam and reassigns "Rogue" to Kim
- **THEN** "Rogue" is owned by Kim, and Sam no longer appears in the list of players to resolve

#### Scenario: Review opens after removing
- **WHEN** the GM confirms Remove for Sam, who owns "Rogue"
- **THEN** the token review for Sam opens, listing "Rogue"

### Requirement: GM can reset the invite link
The GM SHALL be able to read the room's current invite code and to replace it with a new, randomly generated code. Only the room's GM SHALL be allowed to do either. After a reset, joining with the old code SHALL fail with HTTP 404, and joining with the new code SHALL work. A reset SHALL NOT disconnect or revoke anyone already in the room, and their credentials SHALL keep working.

#### Scenario: Old link stops working
- **WHEN** the GM resets the invite and a guest then opens the old link
- **THEN** the join responds 404 "Invite not found" and no participant is added

#### Scenario: Existing participants stay
- **WHEN** players are connected and the GM resets the invite
- **THEN** the players stay connected and can reconnect with their stored credentials

#### Scenario: Player cannot read or reset the invite
- **WHEN** a player requests the room's invite code or asks for a reset
- **THEN** the server responds 403 and the invite code is unchanged

### Requirement: The GM manages access from the room UI
In the room, the GM SHALL see a remove action for each active player in the participants list. The GM SHALL see one Share control at the right end of the room's top bar. It SHALL be visible whether the sidebar is shown or hidden. The Share control's main button SHALL copy the current invite link with one click. The control SHALL also offer a menu, attached to it, with a "Reset link" action that clears the current link and makes a new one. Reset SHALL NOT be a separate panel tab or a separate top-bar button. Remove and Reset link SHALL both ask for confirmation before they take effect, and the remove confirmation SHALL name the player. The invite link copied SHALL be the server's current code, not a copy cached in the browser. Players SHALL NOT see the Share control or the remove action. A revoked guest SHALL see a session-ended screen that says they were removed from the room. The browser SHALL forget its credentials for that room.

#### Scenario: Removing a player from the list
- **WHEN** the GM chooses Remove next to "Sam" and confirms
- **THEN** Sam disappears from everyone's participant list

#### Scenario: Revoked guest's screen
- **WHEN** a guest is revoked while in the room
- **THEN** their page says they were removed from the room, and reloading the page does not reconnect them

#### Scenario: Share shows the current link after a reset elsewhere
- **WHEN** the GM resets the invite in one tab and then opens Share in another tab
- **THEN** the second tab shows the new link

#### Scenario: Share sits at the top right
- **WHEN** the GM opens a room, with the sidebar shown or hidden
- **THEN** the Share control is the last item at the right end of the top bar, and the sidebar header has no Share control

#### Scenario: Clearing the link from the Share menu
- **WHEN** the GM opens the Share control's menu, chooses Reset link, and confirms
- **THEN** the old invite link stops working, a new one is issued, and no panel tab was opened or changed

#### Scenario: Players see no Share control
- **WHEN** a player opens the room
- **THEN** the top bar has no Share control

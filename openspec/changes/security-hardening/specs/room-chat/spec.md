## MODIFIED Requirements

### Requirement: Chat rate limit
One participant SHALL be able to send at most 10 chat messages in any 10-second period, counted across all of that participant's connections to the room. A message over that limit SHALL be refused with a message saying to wait, and SHALL NOT be recorded. The limit SHALL NOT affect other commands or other participants.

#### Scenario: Eleventh message refused
- **WHEN** a participant sends 11 messages within 10 seconds from one tab
- **THEN** the first 10 are recorded and the 11th is refused and not recorded

#### Scenario: A second tab shares the limit
- **WHEN** a participant sends 10 messages from one tab and then 1 from a second tab within 10 seconds
- **THEN** the message from the second tab is refused and not recorded

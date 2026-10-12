## ADDED Requirements

### Requirement: Fog is replaced in one action
The GM SHALL be able to remove and add fog regions in a single command. The room SHALL apply all of it or none of it, and the check against the 100-region limit SHALL use the count after the swap.

#### Scenario: Swap in a full room
- **WHEN** a room holds 100 fog regions and the GM replaces one with a new region
- **THEN** the room still holds 100 regions and the old one is gone

#### Scenario: Swap would exceed the limit
- **WHEN** a replacement would leave more than 100 regions
- **THEN** the command is refused and the fog is unchanged

#### Scenario: Undo
- **WHEN** the GM undoes a replacement
- **THEN** the removed regions return and the added regions go, as one action, even in a full room

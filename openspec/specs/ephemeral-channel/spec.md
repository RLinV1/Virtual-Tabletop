# ephemeral-channel Specification

## Purpose
Carries short-lived pointer interactions (pings, drag previews, and later rulers and area aiming) between clients in a room fast enough to feel live, without ever touching persisted room state.

## Requirements

### Requirement: Ephemeral messages are relayed and never persisted
The server SHALL relay a valid ephemeral message from one participant to every other active participant in the same room, and to no one in another room. An ephemeral message MUST NOT be written to the event log, MUST NOT receive a sequence number, and MUST NOT change room state.

#### Scenario: Ping reaches everyone else
- **WHEN** a player sends a ping in a room with a GM and another player
- **THEN** the GM and the other player each receive that ping with the sender's participant id, and the sender does not receive it back

#### Scenario: No sequence number is used
- **WHEN** a player sends a ping and then a command
- **THEN** the command is acknowledged with the sequence number directly after the one before the ping

#### Scenario: Other rooms do not receive it
- **WHEN** a player in room A sends a ping
- **THEN** no client in room B receives it

### Requirement: Hidden tokens are not revealed through previews
The server MUST NOT relay a drag preview of a hidden token to a player. The server MUST NOT relay a drag preview from a participant who is not allowed to move that token.

#### Scenario: GM drags a hidden token
- **WHEN** the GM drags a hidden token
- **THEN** no player receives a drag preview for it

#### Scenario: Player previews a token they do not own
- **WHEN** a player sends a drag preview for a token they cannot move
- **THEN** no other client receives it

### Requirement: Ephemeral messages do not wait for commits
The server SHALL relay an ephemeral message without waiting for any command from the same connection to finish committing.

#### Scenario: Ping while a command is still committing
- **WHEN** a player sends a command whose commit is held up by the store, and then sends a ping
- **THEN** the other clients receive the ping before that command's event

### Requirement: Pointer traffic is coalesced on the client
The client SHALL send at most one continuous-preview message per stream per 50 ms, and SHALL always send the latest value of a stream once input for it stops. One-shot messages (pings, dice drops) SHALL be sent at once.

#### Scenario: Fast drag
- **WHEN** a drag produces 30 pointer moves within 100 ms
- **THEN** the client sends no more than 3 preview messages for that token, and the last one sent carries the final pointer position

#### Scenario: Ping is not delayed
- **WHEN** a player double-clicks to ping during a drag
- **THEN** the ping is sent immediately, not on the next 50 ms tick

### Requirement: Latency target
Under the benchmark network profile (50 ms one-way delay on each client link, ±10 ms jitter), pings and drag previews SHALL reach other clients with a 95th-percentile latency of 150 ms or less, measured from the sender's send call to the receiver's handler.

#### Scenario: Benchmark run
- **WHEN** a sender emits 100 pings and 100 drag previews to two receivers through the benchmark profile
- **THEN** the measured p95 latency at each receiver is 150 ms or less

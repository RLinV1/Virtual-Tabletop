## Purpose

Keeps one room with unreadable stored history, for example events written by newer server code, from taking down the server. Only the connection or request that asked for that room fails.

## ADDED Requirements

### Requirement: A room that fails to load refuses only that socket connection
When a socket handshake needs a room and loading that room's stored history fails for any reason, the server SHALL refuse that connection with the handshake error `not_found`. The server SHALL log the failure with the room id. The server process SHALL keep running. The refused client SHALL NOT receive a snapshot or any event.

#### Scenario: Reconnecting to a room with an unknown event
- **WHEN** a room's stored history contains an event the server cannot replay and a participant's browser connects to that room with a valid credential
- **THEN** the connection is refused with `not_found`, and the server logs the failure with that room's id

#### Scenario: The server keeps serving after the refusal
- **WHEN** a connection to a room that fails to load has just been refused
- **THEN** `GET /health` still responds 200, and a participant of a different room can still connect and receive a snapshot

### Requirement: A room that fails to load fails only that REST request
When a REST request needs a room and loading that room fails, the server SHALL respond to that request with HTTP 500 `{ "error": "Internal error" }` and SHALL log the failure with the room id. The server process SHALL keep running and SHALL keep answering other requests.

#### Scenario: Joining a room that fails to load
- **WHEN** a guest posts a join to the invite of a room whose history cannot be replayed
- **THEN** the response is 500, no credential is saved, and a following `GET /health` responds 200

### Requirement: A failed room load is retried, not remembered
The server SHALL NOT cache a failed room load. The next connection or request for that room SHALL try to load it again, so that the room works once the server is running code that can read its history.

#### Scenario: Second attempt loads again
- **WHEN** a connection to a room fails because loading failed, and a second connection is then attempted for that room
- **THEN** the server attempts the load again instead of returning a stored failure

### Requirement: Unhandled promise rejections are logged, not fatal
The server process SHALL log any unhandled promise rejection and SHALL keep running.

#### Scenario: A rejection escapes a handler
- **WHEN** a promise rejection is not handled anywhere in the server
- **THEN** the rejection is written to the server log and the process keeps serving requests

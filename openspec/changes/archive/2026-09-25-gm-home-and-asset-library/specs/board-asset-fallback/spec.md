# Spec Delta

## Purpose

Keeps a room playable when an image it references no longer exists, for example after a GM deletes a library asset, by drawing a generic stand-in at the same size and position.

## ADDED Requirements

### Requirement: Token images with fallback
The board SHALL draw a token's image when it has one. When the token has no image, or its image cannot be loaded, the board SHALL draw the token as a disc of its colour. Size, position, ownership ring and status markers are unchanged in both cases.

#### Scenario: Token image loads
- **WHEN** a token with a valid image URL is on the board
- **THEN** the image is drawn clipped to the token's footprint

#### Scenario: Token image missing
- **WHEN** a token's image URL returns not-found
- **THEN** the token is drawn as a disc of its colour at the same position and size, and no error is shown to players

### Requirement: Map fallback
When a room's map image cannot be loaded, the board SHALL draw a neutral generic map at the stored map width and height, with the room's grid over it. All board coordinates and token positions SHALL stay the same.

#### Scenario: Map image missing
- **WHEN** the room's 2048x1536 map image returns not-found
- **THEN** a neutral 2048x1536 surface is drawn with the grid, and every token remains at its board position

### Requirement: Missing images return not-found
The server SHALL answer a request for an image that does not exist with HTTP 404, not a server error. This holds for both object-storage and local-disk storage.

#### Scenario: Deleted object requested
- **WHEN** a client requests the URL of a deleted asset
- **THEN** the response status is 404

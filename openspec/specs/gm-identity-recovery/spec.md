# gm-identity-recovery Specification

## Purpose

Keeps a GM usable after the server forgets their device identity. A browser that still holds its GM token registers that same token again instead of getting stuck or replacing it.

## Requirements

### Requirement: Re-register a stored GM token the server does not recognise
When a GM-only request made with the browser's stored GM token is rejected as unauthenticated, the client SHALL register that same token with the server again and retry the original request once. Registration SHALL be idempotent: registering a token the server already knows MUST leave its identity, and the rooms and assets it owns, unchanged.

#### Scenario: Stored token recovers after the server's data is reset
- **WHEN** the browser holds a GM token, the server has no record of it, and the GM opens the dashboard or asset library
- **THEN** the first GM request is rejected, the client registers the stored token, the request is retried with that same token and succeeds, and the GM sees their (possibly empty) rooms or library without clearing site data

#### Scenario: Registering a known token keeps ownership
- **WHEN** a token the server already recognises is registered again
- **THEN** requests with that token still resolve to the same GM identity and still see every room and asset it owned

### Requirement: Recovery never replaces the GM token
The client MUST NOT generate, store, or send a new GM token while recovering from a rejected GM request. The token in browser storage after recovery SHALL be the same token that was there before.

#### Scenario: Token is unchanged after recovery
- **WHEN** a GM request is rejected and recovery runs
- **THEN** the registration request and the retried request carry the stored token, and browser storage still holds that token afterwards

### Requirement: Recovery is bounded
The client SHALL attempt re-registration at most once per rejected request. If the retried request is also rejected as unauthenticated, or registration itself fails, the client SHALL report the error to the user and MUST NOT retry again. Requests rejected for any reason other than missing authentication SHALL NOT trigger re-registration.

#### Scenario: Still rejected after re-registering
- **WHEN** a GM request is rejected, the token is registered again, and the retried request is rejected again
- **THEN** the user sees the error, and no further registration or retry is attempted for that request

#### Scenario: Other errors pass through
- **WHEN** a GM request fails as not found, invalid, or with a server error
- **THEN** the error is reported as-is and no registration request is sent

#### Scenario: Concurrent rejections share one registration
- **WHEN** several GM requests made with the same token are rejected at the same time
- **THEN** the client sends one registration request for that token, and each rejected request is retried once after it completes

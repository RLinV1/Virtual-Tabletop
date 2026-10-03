# Spec Delta

## REMOVED Requirements

### Requirement: Re-register a stored GM token the server does not recognise
**Reason**: Device identities are legacy and can no longer create anything (`gm-home`, "GM device identity"). Registering a forgotten token again would create an empty identity that can never own anything.
**Migration**: Replaced by "Forget a GM token the server does not recognise". A GM whose device identity was lost signs in to an account instead.

### Requirement: Recovery never replaces the GM token
**Reason**: The client no longer generates GM tokens at all, so there is nothing to replace a token with.
**Migration**: `gm-home`, "GM device identity", forbids generating a new token.

### Requirement: Recovery is bounded
**Reason**: There is no re-registration left to bound.
**Migration**: None needed. A rejected legacy request is reported once and the token is forgotten.

## ADDED Requirements

### Requirement: Forget a GM token the server does not recognise
When a request made with the browser's stored legacy GM token is rejected because the server does not recognise the token, the client SHALL delete the token from browser storage. It SHALL NOT register the token again, SHALL NOT retry the request with it, and SHALL NOT generate a replacement. A rejection for any other reason SHALL leave the stored token in place.

#### Scenario: Server forgot the device identity
- **WHEN** the browser holds a GM token, the server has no record of it, and the dashboard asks the server what that token owns
- **THEN** the request is rejected as unauthenticated, the token is removed from the browser, no registration request is sent, and no move into the account is offered

#### Scenario: Other errors keep the token
- **WHEN** a request with the stored GM token fails as not found or with a server error
- **THEN** the token stays in browser storage and the error is reported as-is

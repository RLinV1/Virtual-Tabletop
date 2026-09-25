# Spec Delta

## ADDED Requirements

### Requirement: Browsing the library does not create an owner
Opening the asset library MUST NOT create a GM identity. A browser with no GM identity SHALL see an empty library and an invitation to upload, and SHALL make no request for its assets. The first upload SHALL create the GM identity, which then owns the uploaded asset.

#### Scenario: Browsing without an identity
- **WHEN** a browser with no GM token opens the asset library
- **THEN** an empty state and the upload action are shown, no request for library assets is made, no GM token is stored, and no identity is created on the server

#### Scenario: First upload creates the owner
- **WHEN** a browser with no GM token uploads a map to the library
- **THEN** a GM identity is created, the map is owned by it, and it is listed in the library afterwards

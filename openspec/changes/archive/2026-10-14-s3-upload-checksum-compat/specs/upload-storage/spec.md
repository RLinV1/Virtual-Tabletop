## ADDED Requirements

### Requirement: Uploads to object storage succeed against SeaweedFS
When SeaweedFS is in use, storing an uploaded image SHALL succeed for streamed uploads of any allowed size. The server SHALL NOT send request-checksum trailers that SeaweedFS does not accept.

#### Scenario: Upload with SeaweedFS in use
- **WHEN** a GM uploads a map image while SeaweedFS is the object store
- **THEN** the upload succeeds and the image is served from `/uploads/<key>`

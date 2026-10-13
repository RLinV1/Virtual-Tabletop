# upload-storage Specification

## Purpose
Defines where uploaded images are kept and served from: SeaweedFS whenever it is available and always in production, with a local disk copy as the fallback, and deletes that remove every copy.

## Requirements

### Requirement: Uploads go to SeaweedFS when it is available
The server SHALL store uploaded images in SeaweedFS whenever SeaweedFS is reachable. It SHALL use `S3_ENDPOINT` when set. Otherwise, outside production, it SHALL detect the local development SeaweedFS at `http://127.0.0.1:8333`. It SHALL fall back to local disk only when no S3 store answers, or when detection is turned off with `S3_AUTODETECT=0`, and it SHALL log which storage it chose.

#### Scenario: Compose SeaweedFS running, no settings
- **WHEN** the dev server starts without `S3_ENDPOINT` while the compose SeaweedFS is running
- **THEN** uploads are stored in the SeaweedFS bucket and the log names SeaweedFS

#### Scenario: No SeaweedFS running
- **WHEN** the dev server starts without `S3_ENDPOINT` and nothing answers at 127.0.0.1:8333
- **THEN** it starts within about a second, stores uploads on local disk, and logs that it did

#### Scenario: Detection turned off
- **WHEN** `S3_AUTODETECT=0` and `S3_ENDPOINT` is unset
- **THEN** uploads are stored on local disk without probing

### Requirement: Every upload is kept on local disk
Every uploaded image SHALL be written to the server's local upload folder. When SeaweedFS is in use, it SHALL also be stored in SeaweedFS, which serves it. Deleting a library asset SHALL remove it from both, so a deleted asset stops loading everywhere.

#### Scenario: Upload with SeaweedFS running
- **WHEN** a GM uploads a map while SeaweedFS is in use
- **THEN** the image is in the SeaweedFS bucket and in the local upload folder

#### Scenario: Delete removes both copies
- **WHEN** the GM deletes that map from the library
- **THEN** it is gone from SeaweedFS and from the local folder, and `/uploads/<key>` answers 404

### Requirement: Production requires SeaweedFS
With `NODE_ENV=production`, the server SHALL refuse to start unless `S3_ENDPOINT` is set and reachable.

#### Scenario: Missing setting in production
- **WHEN** the server starts with `NODE_ENV=production` and no `S3_ENDPOINT`
- **THEN** startup fails with an error naming `S3_ENDPOINT`

### Requirement: Earlier disk uploads stay reachable
While SeaweedFS is in use, a request for `/uploads/<key>` that SeaweedFS does not have SHALL be served from the local upload folder if the file is there, and SHALL answer 404 otherwise.

#### Scenario: Image uploaded before the switch
- **WHEN** a room references `/uploads/<key>`, whose file is only on local disk, and the server now uses SeaweedFS
- **THEN** the image is served from disk

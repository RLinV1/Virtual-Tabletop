# upload-storage Specification

## Purpose
TBD - created by archiving change prefer-minio-when-available. Update Purpose after archive.

## Requirements

### Requirement: Uploads go to MinIO when it is available
The server SHALL store uploaded images in MinIO whenever MinIO is reachable. It SHALL use `MINIO_ENDPOINT` when set. Otherwise, outside production, it SHALL detect the local development MinIO at `http://127.0.0.1:9000`. It SHALL fall back to local disk only when no MinIO answers, or when detection is turned off with `MINIO_AUTODETECT=0`, and it SHALL log which storage it chose.

#### Scenario: Compose MinIO running, no settings
- **WHEN** the dev server starts without `MINIO_ENDPOINT` while the compose MinIO is running
- **THEN** uploads are stored in the MinIO bucket and the log names MinIO

#### Scenario: No MinIO running
- **WHEN** the dev server starts without `MINIO_ENDPOINT` and nothing answers at 127.0.0.1:9000
- **THEN** it starts within about a second, stores uploads on local disk, and logs that it did

#### Scenario: Detection turned off
- **WHEN** `MINIO_AUTODETECT=0` and `MINIO_ENDPOINT` is unset
- **THEN** uploads are stored on local disk without probing

### Requirement: Every upload is kept on local disk
Every uploaded image SHALL be written to the server's local upload folder. When MinIO is in use, it SHALL also be stored in MinIO, which serves it. Deleting a library asset SHALL remove it from both, so a deleted asset stops loading everywhere.

#### Scenario: Upload with MinIO running
- **WHEN** a GM uploads a map while MinIO is in use
- **THEN** the image is in the MinIO bucket and in the local upload folder

#### Scenario: Delete removes both copies
- **WHEN** the GM deletes that map from the library
- **THEN** it is gone from MinIO and from the local folder, and `/uploads/<key>` answers 404

### Requirement: Production requires MinIO
With `NODE_ENV=production`, the server SHALL refuse to start unless `MINIO_ENDPOINT` is set and reachable.

#### Scenario: Missing setting in production
- **WHEN** the server starts with `NODE_ENV=production` and no `MINIO_ENDPOINT`
- **THEN** startup fails with an error naming `MINIO_ENDPOINT`

### Requirement: Earlier disk uploads stay reachable
While MinIO is in use, a request for `/uploads/<key>` that MinIO does not have SHALL be served from the local upload folder if the file is there, and SHALL answer 404 otherwise.

#### Scenario: Image uploaded before the switch
- **WHEN** a room references `/uploads/<key>`, whose file is only on local disk, and the server now uses MinIO
- **THEN** the image is served from disk

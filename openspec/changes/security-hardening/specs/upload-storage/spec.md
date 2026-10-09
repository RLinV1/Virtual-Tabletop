## MODIFIED Requirements

### Requirement: Production requires MinIO
With `NODE_ENV=production`, the server SHALL refuse to start unless `MINIO_ENDPOINT` is set and reachable, and unless `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are both set. It SHALL NOT fall back to the development credentials in production. Outside production, unset credentials SHALL default to the docker-compose development values.

#### Scenario: Missing setting in production
- **WHEN** the server starts with `NODE_ENV=production` and no `MINIO_ENDPOINT`
- **THEN** startup fails with an error naming `MINIO_ENDPOINT`

#### Scenario: Missing credentials in production
- **WHEN** the server starts with `NODE_ENV=production` and `MINIO_ENDPOINT` set, but `MINIO_ACCESS_KEY` or `MINIO_SECRET_KEY` unset
- **THEN** startup fails with an error naming both variables, without connecting to MinIO

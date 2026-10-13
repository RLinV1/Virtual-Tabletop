## MODIFIED Requirements

### Requirement: Production requires object storage
With `NODE_ENV=production`, the server SHALL refuse to start unless `S3_ENDPOINT` is set and reachable, and unless `S3_ACCESS_KEY` and `S3_SECRET_KEY` are both set. It SHALL NOT fall back to the development credentials in production. Outside production, unset credentials SHALL default to the docker-compose development values.

#### Scenario: Missing setting in production
- **WHEN** the server starts with `NODE_ENV=production` and no `S3_ENDPOINT`
- **THEN** startup fails with an error naming `S3_ENDPOINT`

#### Scenario: Missing credentials in production
- **WHEN** the server starts with `NODE_ENV=production` and `S3_ENDPOINT` set, but `S3_ACCESS_KEY` or `S3_SECRET_KEY` unset
- **THEN** startup fails with an error naming both variables, without connecting to object storage

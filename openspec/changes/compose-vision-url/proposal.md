## Why

In the docker compose stack, automatic grid detection always ends in "Grid analysis failed". The server sends map images to `VISION_URL`, which defaults to `http://127.0.0.1:8000`. Inside the server container that is the server itself, so the call is refused. The vision service runs in its own container at `http://vision:8000`, and `docker-compose.yml` never gives the server that address.

## What Changes

- The compose `server` service sets `VISION_URL=http://vision:8000`.
- No code, API or storage change. The `127.0.0.1:8000` default stays for running the server from source with the vision service on the host.

## Capabilities

### Modified Capabilities
- `map-preparation`: grid analysis works in the compose stack.

## Impact

- `docker-compose.yml` (the `server` environment).
- Verified by uploading a map in the compose app and seeing the analysis finish instead of erroring.

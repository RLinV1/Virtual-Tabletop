## 1. Compose

- [x] 1.1 Add `VISION_URL: http://vision:8000` to the `server` environment in `docker-compose.yml`; verify `docker compose config` shows it

## 2. Verify

- [x] 2.1 Recreate `server` and verify `docker compose exec server env` shows `VISION_URL` and a map upload's analysis no longer ends in an error

# Grid detection deployment

Map uploads stay playable while the server analyzes them. Start the private vision service with `docker compose up -d vision`; local Node development uses `VISION_URL=http://127.0.0.1:8000`. The service listens on the Compose network and the loopback host port only. Do not publish it through the app ingress.

For deployment, set `VISION_URL` to the private service address, for example `http://vision:8000`, and set `REDIS_URL` to the application's Redis instance. BullMQ stores jobs there; the Node server hosts a worker. Keep the existing `DATABASE_URL` and object-storage configuration. The worker reads by the server-owned object key, never by an image URL supplied by a caller. Do not put the vision service behind the player-facing reverse proxy.

When Redis is absent, local development and tests dispatch work asynchronously inside the Node process. Persisted queued work is re-enqueued on startup; stale running work is assigned a new attempt after 60 seconds. An unavailable queue, image, or service records an error while leaving the upload usable. The relevant GM editor offers Try again. Existing maps are not backfilled. A suggestion never changes a saved or room grid until the GM selects Use suggestion and then saves or applies it.

Analysis accepts PNG, JPEG or WebP uploads up to 25 MB and decoded images up to 40 megapixels, with each edge at most 16,384 pixels. The Node request timeout is 15 seconds. `VISION_URL` must be reachable only from the application network.

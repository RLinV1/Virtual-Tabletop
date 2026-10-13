# The app server and the web dev server, for `docker compose up` (docker-compose.yml).
# One image, two commands. The repo is copied in, so rebuild after code changes:
#   docker compose up -d --build
FROM node:22-bookworm
WORKDIR /app
COPY . .
RUN npm ci
EXPOSE 3001 5173
CMD ["npm", "run", "dev"]

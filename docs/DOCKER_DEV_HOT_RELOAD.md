# Docker Compose Dev Auto-Reload

How hot code reloading works inside Docker containers during local development, and how to verify or
extend the file watcher setup.

## Overview

The default `compose.yaml` dev services bind-mount the repository into the container and run the
workspace `dev` scripts. Source edits on the host are picked up by each runtime's file watcher and
reload the process without rebuilding images.

| Service    | Watcher                         | Reload behavior                                 | Host port |
| ---------- | ------------------------------- | ----------------------------------------------- | --------- |
| `backend`  | `node --watch src/server.js`    | process restart on JS change                    | `3001`    |
| `frontend` | Vite dev server (`npm run dev`) | HMR for JS/TS/CSS; full reload for `index.html` | `5173`    |

The same pattern applies to the `devnet` profile services (`backend-devnet`, `frontend-devnet`).

## How it works

```yaml
# compose.yaml (excerpt)
backend:
  image: node:20-alpine
  working_dir: /app/backend
  command: sh -c "npm install && npm run dev"
  volumes:
    - ./:/app
    - backend_node_modules:/app/backend/node_modules
```

1. **Bind mount** — `./:/app` maps the host working tree into the container. File writes on the host
   appear immediately inside the container.
2. **Named volume for `node_modules`** — keeps container-installed dependencies off the host mount
   so host/container platform differences never break the watcher.
3. **Dev scripts own the watch loop** — `backend` uses Node's built-in `--watch`; `frontend` uses
   Vite's watcher + HMR websocket (`--host 0.0.0.0` so the browser on the host can reach it).

No extra file-watcher daemon (nodemon, chokidar-cli, watchexec) is required.

## Usage

```bash
# default dev stack (backend + frontend)
docker compose up

# full local stack including Stellar devnet
npm run dev:devnet
```

Edit any file under `backend/src/` or `frontend/src/` and the corresponding service reloads.

## Verifying the watcher

```bash
# backend: touch a source file and confirm restart logs
docker compose exec backend sh -c "touch src/server.js"
docker compose logs -f backend

# frontend: edit a component and confirm HMR in the browser console
```

## Troubleshooting

| Symptom                          | Cause                                         | Fix                                                          |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Edits not picked up              | File created on a path outside the bind mount | Keep sources under the repo root (the `./:/app` mount)       |
| `node_modules` missing host-side | Expected — modules live in a named volume     | Use `docker compose exec <svc> npm <cmd>` to run installs    |
| HMR websocket fails in browser   | Vite not bound to `0.0.0.0`                   | Keep `npm run dev -- --host 0.0.0.0` in the compose command  |
| macOS/Windows watcher lag        | OS file-event latency over the bind mount     | Touch the file directly inside the container to force reload |

## Related

- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — running without contracts / mock mode
- [`ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md) — system component map
- [`../compose.yaml`](../compose.yaml) — service definitions

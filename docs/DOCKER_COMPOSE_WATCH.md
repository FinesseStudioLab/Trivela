# Docker Compose Auto-Reload File Watcher Guide

## Overview

Trivela supports native Docker Compose File Watching via `develop.watch` (Docker Compose v2.22.0+).
This allows developers to edit code locally and have changes synchronize instantly with running
containers, triggering Hot Module Replacement (HMR) in the Vite frontend and instant code execution
in the Node.js backend without having to restart or rebuild containers manually.

---

## Architecture & Configuration

The root [`compose.yaml`](../compose.yaml) declares watch configurations for both the `backend` and
`frontend` services:

### 1. Backend Service (`backend`)

```yaml
develop:
  watch:
    - action: sync
      path: ./backend/src
      target: /app/backend/src
    - action: rebuild
      path: ./backend/package.json
```

- **`sync`**: Any changes to files inside `./backend/src` are synchronized immediately into
  `/app/backend/src`. The backend service uses `nodemon` or Node file watchers to reload affected
  modules.
- **`rebuild`**: Any modification to `./backend/package.json` (such as installing a new dependency)
  automatically triggers an image rebuild and container restart.

### 2. Frontend Service (`frontend`)

```yaml
environment:
  VITE_API_URL: http://backend:3001
  VITE_STELLAR_NETWORK: testnet
  CHOKIDAR_USEPOLLING: 'true'
develop:
  watch:
    - action: sync
      path: ./frontend/src
      target: /app/frontend/src
    - action: sync
      path: ./frontend/public
      target: /app/frontend/public
    - action: rebuild
      path: ./frontend/package.json
```

- **`sync`**: Changes to `./frontend/src` and static assets in `./frontend/public` are mirrored into
  the running container instantly. Vite's development server receives the event and sends Hot Module
  Replacement (HMR) updates directly to connected browsers.
- **`rebuild`**: Changing `./frontend/package.json` prompts Docker Compose to rebuild the frontend
  container image to guarantee consistent `node_modules`.
- **`CHOKIDAR_USEPOLLING="true"`**: Configured in `frontend/vite.config.js`
  (`server.watch.usePolling`) to ensure file system notifications reliably cross hypervisor and
  mount boundaries on Windows (Docker Desktop / WSL2) and macOS (VirtioFS / gRPC FUSE).

---

## Usage

### Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2.22.0 or newer.

### Starting Dev Environment with Watcher

You can run the watch process using any of the following convenient entry points:

1. **Using npm:**

   ```bash
   npm run dev:watch
   ```

2. **Using make:**

   ```bash
   make dev-watch
   ```

3. **Using Docker Compose CLI directly:**

   ```bash
   # Run along with the default compose stack
   docker compose watch

   # Or launch and watch simultaneously
   docker compose up --watch
   ```

---

## Cross-Platform File System Polling

When running Docker on Windows (WSL2 or Hyper-V) or macOS, standard Linux inotify events inside the
container may occasionally be missed when files are edited on the host OS.

Trivela handles this transparently:

1. `compose.yaml` sets `CHOKIDAR_USEPOLLING: "true"` on the frontend service.
2. `frontend/vite.config.js` inspects `process.env.CHOKIDAR_USEPOLLING`:
   ```javascript
   server: {
     port: 5173,
     watch: {
       usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
     },
     // ...
   }
   ```
3. This guarantees that file change events are captured reliably across all host operating systems
   without impacting Linux host performance where polling is disabled by default.

---

## Troubleshooting

- **Container does not pick up dependencies:** If you add a package to `package.json`, compose watch
  triggers a rebuild. If your lockfile (`package-lock.json`) was also updated, run
  `docker compose up --build` to force a clean installation.
- **Port conflicts:** Ensure ports `3001` (backend), `5173` (frontend), and `6379` (redis) are free
  on your host machine before starting.
- **Logs:** To view logs alongside the watcher, run `docker compose logs -f backend frontend` in a
  separate terminal.

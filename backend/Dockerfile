# syntax=docker/dockerfile:1.7
#
# Build context for this Dockerfile is the repo root (the monorepo uses
# npm workspaces and the package-lock.json lives at the root):
#
#   docker build -f backend/Dockerfile -t trivela-backend .
#
# See backend/README.md for runtime env vars and example `docker run` flags.

# ---- builder ---------------------------------------------------------------
# Compiles native modules (better-sqlite3) against Node 20 headers, then
# produces a clean production node_modules tree using the root lockfile so
# installs are reproducible.
FROM node:20-alpine AS builder

WORKDIR /app

# Build toolchain only needed for native deps; discarded with this stage.
RUN apk add --no-cache python3 make g++

# Copy the workspace manifests first so this layer caches independently
# of source changes. The package-lock.json at the repo root pins versions
# for every workspace. The frontend manifest is needed because npm
# validates the workspaces config but its dependencies are not installed
# (we scope the install to the backend workspace below).
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

# Install only the backend workspace (and hoisted root deps) for production.
# `--ignore-scripts` blocks any post-install scripts from running during
# install; better-sqlite3 ships native bindings, so we rebuild explicitly.
RUN npm ci --omit=dev --workspace=backend --include-workspace-root --ignore-scripts \
    && npm rebuild --workspace=backend better-sqlite3

# ---- runtime ---------------------------------------------------------------
# Minimal runtime image: Node, dumb-init for signal forwarding, the
# production node_modules tree, and the application source. No build
# toolchain ships in the final image.
FROM node:20-alpine AS runtime

# dumb-init makes Node respond to SIGTERM/SIGINT cleanly when PID 1.
RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

# Workspace symlinks at backend/node_modules point into the root tree, so
# we copy both the hoisted root node_modules and the backend's local one.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/package.json
COPY backend/src ./backend/src
COPY package.json ./package.json

WORKDIR /app/backend

# Drop root: the `node` user ships with the official image (uid/gid 1000).
# `/app` is owned by node so the runtime can read application files; the
# user has no write access to other paths by default — mount a volume if
# persistence is required (see backend/README.md).
RUN chown -R node:node /app
USER node

EXPOSE 3001

# Inline health probe: hits the same /health endpoint the platform exposes.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+ (process.env.PORT||3001) +'/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]

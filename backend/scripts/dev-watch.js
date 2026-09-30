#!/usr/bin/env node
/**
 * Polling file watcher that restarts the backend on source changes.
 *
 * `node --watch` relies on inotify/FSEvents, which are unreliable on Docker
 * bind mounts (Docker Desktop on macOS/Windows, network filesystems). This
 * watcher stats files on an interval so hot reload works everywhere.
 *
 * Env: WATCH_POLL_INTERVAL_MS (default 500, min 50).
 */
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json'];
const IGNORED_DIRS = new Set(['node_modules', '.git', 'uploads']);

export function parseInterval(value, fallback = 500) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(n, 50);
}

/** Map of absolute file path -> mtimeMs:size for watched files under `dir`. */
export function snapshot(dir, extensions = DEFAULT_EXTENSIONS, out = new Map()) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) snapshot(full, extensions, out);
    } else if (extensions.includes(path.extname(entry.name))) {
      try {
        const st = statSync(full);
        out.set(full, `${st.mtimeMs}:${st.size}`);
      } catch {
        // File vanished between readdir and stat; next poll will reflect it.
      }
    }
  }
  return out;
}

/** Returns the list of added, removed and modified paths between snapshots. */
export function diffSnapshots(prev, next) {
  const changed = [];
  for (const [file, sig] of next) {
    if (prev.get(file) !== sig) changed.push(file);
  }
  for (const file of prev.keys()) {
    if (!next.has(file)) changed.push(file);
  }
  return changed.sort();
}

export function startWatcher({
  dirs,
  command = process.execPath,
  args,
  intervalMs = 500,
  log = console.log,
}) {
  let child;
  let prev = new Map();
  for (const d of dirs) snapshot(d, DEFAULT_EXTENSIONS, prev);

  const start = () => {
    child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code, signal) => {
      if (signal !== 'SIGTERM') log(`[dev-watch] process exited (${code ?? signal}); waiting for changes`);
    });
  };
  const restart = () => {
    const old = child;
    if (old && old.exitCode === null && old.signalCode === null) {
      old.once('exit', start);
      old.kill('SIGTERM');
    } else {
      start();
    }
  };

  start();
  const timer = setInterval(() => {
    const next = new Map();
    for (const d of dirs) snapshot(d, DEFAULT_EXTENSIONS, next);
    const changed = diffSnapshots(prev, next);
    prev = next;
    if (changed.length > 0) {
      log(`[dev-watch] change detected (${changed.length} file(s)), restarting`);
      restart();
    }
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
      child?.kill('SIGTERM');
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const watcher = startWatcher({
    dirs: [path.join(root, 'src')],
    args: [path.join(root, 'src/server.js')],
    intervalMs: parseInterval(process.env.WATCH_POLL_INTERVAL_MS),
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      watcher.stop();
      process.exit(0);
    });
  }
}

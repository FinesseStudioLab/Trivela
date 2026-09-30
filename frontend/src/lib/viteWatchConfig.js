// Dev-server watch options for Vite (issue #1366).
//
// Bind-mounted source directories in Docker Compose don't reliably emit
// native filesystem events (inotify) across every host platform — Docker
// Desktop on macOS/Windows in particular. Chokidar's polling mode works
// everywhere at the cost of some CPU, so it's opted into only when the
// container sets CHOKIDAR_USEPOLLING, leaving native (non-polling) watching
// as the default for local, non-Docker development.
export function getWatchOptions(env = process.env) {
  const usePolling = env.CHOKIDAR_USEPOLLING === 'true';

  if (!usePolling) {
    return {};
  }

  return {
    usePolling: true,
    interval: 300,
  };
}

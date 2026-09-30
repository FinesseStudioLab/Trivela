// Verifies the Docker Compose dev services are wired for hot reload
// (issue #1366): source is bind-mounted and each dev service either uses a
// polling-capable watcher or opts into Chokidar polling, since bind mounts
// don't reliably deliver native filesystem events inside a container on
// every host platform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const compose = yaml.load(readFileSync(path.join(repoRoot, 'compose.yaml'), 'utf8'));

function bindMountsRepoRoot(service) {
  return (service.volumes ?? []).some((v) => v === './:/app');
}

const backendServices = ['backend', 'backend-devnet'];
const frontendServices = ['frontend', 'frontend-devnet'];

for (const name of backendServices) {
  test(`${name} bind-mounts the repo and runs the polling-based dev script`, () => {
    const service = compose.services[name];
    assert.ok(service, `expected a "${name}" service in compose.yaml`);
    assert.ok(bindMountsRepoRoot(service), `${name} should bind-mount ./:/app for hot reload`);
    assert.match(
      service.command,
      /npm run dev:docker/,
      `${name} should run the docker-specific (polling) dev script`
    );
  });
}

for (const name of frontendServices) {
  test(`${name} bind-mounts the repo and enables Chokidar polling`, () => {
    const service = compose.services[name];
    assert.ok(service, `expected a "${name}" service in compose.yaml`);
    assert.ok(bindMountsRepoRoot(service), `${name} should bind-mount ./:/app for hot reload`);
    assert.equal(
      service.environment?.CHOKIDAR_USEPOLLING,
      'true',
      `${name} should set CHOKIDAR_USEPOLLING=true so Vite polls the bind mount`
    );
  });
}

test('backend package.json defines a polling-based dev:docker script', () => {
  const backendPkg = JSON.parse(
    readFileSync(path.join(repoRoot, 'backend/package.json'), 'utf8')
  );
  assert.match(backendPkg.scripts['dev:docker'], /nodemon/);
  assert.match(backendPkg.scripts['dev:docker'], /--legacy-watch/);
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

describe('Docker Compose Dev Watch Configuration (Issue #1366)', () => {
  const composePath = path.join(rootDir, 'compose.yaml');

  it('compose.yaml exists and is valid YAML', () => {
    assert.ok(fs.existsSync(composePath), 'compose.yaml must exist');
    const content = fs.readFileSync(composePath, 'utf8');
    const doc = yaml.parse(content);
    assert.ok(doc && typeof doc === 'object', 'compose.yaml must parse as an object');
    assert.ok(doc.services, 'compose.yaml must have services');
  });

  it('backend service has develop.watch configured correctly', () => {
    const content = fs.readFileSync(composePath, 'utf8');
    const doc = yaml.parse(content);
    const backend = doc.services.backend;
    assert.ok(backend, 'backend service must exist in compose.yaml');
    assert.ok(backend.develop, 'backend service must have develop block');
    assert.ok(Array.isArray(backend.develop.watch), 'backend.develop.watch must be an array');

    const srcSync = backend.develop.watch.find(
      (w) => w.action === 'sync' && w.path === './backend/src'
    );
    assert.ok(srcSync, 'backend watch must include sync for ./backend/src');
    assert.strictEqual(srcSync.target, '/app/backend/src');

    const pkgRebuild = backend.develop.watch.find(
      (w) => w.action === 'rebuild' && w.path === './backend/package.json'
    );
    assert.ok(pkgRebuild, 'backend watch must include rebuild for ./backend/package.json');
  });

  it('frontend service has develop.watch and CHOKIDAR_USEPOLLING configured', () => {
    const content = fs.readFileSync(composePath, 'utf8');
    const doc = yaml.parse(content);
    const frontend = doc.services.frontend;
    assert.ok(frontend, 'frontend service must exist in compose.yaml');
    assert.strictEqual(
      frontend.environment?.CHOKIDAR_USEPOLLING,
      'true',
      'frontend must define CHOKIDAR_USEPOLLING: "true"'
    );
    assert.ok(frontend.develop, 'frontend service must have develop block');
    assert.ok(Array.isArray(frontend.develop.watch), 'frontend.develop.watch must be an array');

    const srcSync = frontend.develop.watch.find(
      (w) => w.action === 'sync' && w.path === './frontend/src'
    );
    assert.ok(srcSync, 'frontend watch must include sync for ./frontend/src');
    assert.strictEqual(srcSync.target, '/app/frontend/src');

    const publicSync = frontend.develop.watch.find(
      (w) => w.action === 'sync' && w.path === './frontend/public'
    );
    assert.ok(publicSync, 'frontend watch must include sync for ./frontend/public');
    assert.strictEqual(publicSync.target, '/app/frontend/public');

    const pkgRebuild = frontend.develop.watch.find(
      (w) => w.action === 'rebuild' && w.path === './frontend/package.json'
    );
    assert.ok(pkgRebuild, 'frontend watch must include rebuild for ./frontend/package.json');
  });

  it('frontend/vite.config.js references CHOKIDAR_USEPOLLING', () => {
    const viteConfigPath = path.join(rootDir, 'frontend', 'vite.config.js');
    assert.ok(fs.existsSync(viteConfigPath), 'vite.config.js must exist');
    const viteContent = fs.readFileSync(viteConfigPath, 'utf8');
    assert.ok(
      viteContent.includes('CHOKIDAR_USEPOLLING'),
      'vite.config.js must check process.env.CHOKIDAR_USEPOLLING'
    );
  });
});

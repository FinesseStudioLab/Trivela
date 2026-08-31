import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLocalStorageAdapter } from './localStorage.js';

test('local storage adapter uploads file and returns public URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trivela-upload-'));
  try {
    const adapter = createLocalStorageAdapter({
      uploadDir: dir,
      publicBaseUrl: 'http://localhost:3001/uploads',
    });

    const result = await adapter.upload({
      buffer: Buffer.from('hello-image'),
      filename: 'test.png',
      mimeType: 'image/png',
    });

    assert.equal(result.url, 'http://localhost:3001/uploads/test.png');
    assert.equal(result.key, 'test.png');
    assert.equal(await readFile(join(dir, 'test.png'), 'utf8'), 'hello-image');
    assert.equal(adapter.backendName, 'local');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

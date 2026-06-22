import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateImageUpload,
  MAX_IMAGE_SIZE_BYTES,
  prepareImageForStorage,
} from './imageUpload.js';

test('validateImageUpload rejects missing file', () => {
  const result = validateImageUpload({ buffer: Buffer.alloc(0), mimetype: '', size: 0 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'MISSING_FILE');
  }
});

test('validateImageUpload rejects oversized file', () => {
  const result = validateImageUpload({
    buffer: Buffer.alloc(100),
    mimetype: 'image/png',
    size: MAX_IMAGE_SIZE_BYTES + 1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'FILE_TOO_LARGE');
  }
});

test('validateImageUpload rejects invalid mime type', () => {
  const result = validateImageUpload({
    buffer: Buffer.from('data'),
    mimetype: 'application/pdf',
    size: 4,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'INVALID_MIME_TYPE');
  }
});

test('validateImageUpload accepts allowed mime types', () => {
  const result = validateImageUpload({
    buffer: Buffer.from('data'),
    mimetype: 'image/png',
    size: 4,
  });
  assert.equal(result.ok, true);
});

test('prepareImageForStorage generates unique campaign filename', () => {
  const first = prepareImageForStorage({
    buffer: Buffer.from('png'),
    mimeType: 'image/png',
    campaignId: '42',
  });
  const second = prepareImageForStorage({
    buffer: Buffer.from('png'),
    mimeType: 'image/png',
    campaignId: '42',
  });

  assert.match(first.filename, /^campaign-42-.*\.png$/);
  assert.notEqual(first.filename, second.filename);
});

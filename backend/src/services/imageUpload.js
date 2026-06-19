import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { stripExifMetadata } from './exifStripper.js';

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

/**
 * @param {{ buffer: Buffer, mimetype: string, size: number, originalname?: string }} file
 * @returns {{ ok: true, buffer: Buffer, mimeType: string, filename: string } | { ok: false, error: string, code: string }}
 */
export function validateImageUpload(file) {
  if (!file || !file.buffer || file.buffer.length === 0) {
    return { ok: false, error: 'Image file is required', code: 'MISSING_FILE' };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { ok: false, error: 'Image must be 5MB or smaller', code: 'FILE_TOO_LARGE' };
  }

  const mimeType = file.mimetype?.toLowerCase() ?? '';
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      error: 'Unsupported image type. Allowed: image/png, image/jpeg, image/webp, image/svg+xml',
      code: 'INVALID_MIME_TYPE',
    };
  }

  return { ok: true, buffer: file.buffer, mimeType, filename: '' };
}

/**
 * @param {{ buffer: Buffer, mimeType: string, campaignId: string }} params
 * @returns {{ buffer: Buffer, filename: string }}
 */
export function prepareImageForStorage({ buffer, mimeType, campaignId }) {
  const ext = MIME_TO_EXT[mimeType] ?? extname('.bin');
  const filename = `campaign-${campaignId}-${randomUUID()}${ext}`;
  const stripped = stripExifMetadata(buffer);
  return { buffer: stripped, filename };
}

/**
 * @param {import('../storage/storageAdapter.js').StorageAdapter} storage
 * @param {{ buffer: Buffer, mimeType: string, campaignId: string }} params
 * @returns {Promise<{ imageUrl: string }>}
 */
export async function uploadCampaignImage(storage, { buffer, mimeType, campaignId }) {
  const prepared = prepareImageForStorage({ buffer, mimeType, campaignId });
  const result = await storage.upload({
    buffer: prepared.buffer,
    filename: prepared.filename,
    mimeType,
  });
  return { imageUrl: result.url };
}

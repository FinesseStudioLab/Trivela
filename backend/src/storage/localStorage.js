import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @param {{ uploadDir?: string, publicBaseUrl?: string }} [options]
 * @returns {import('./storageAdapter.js').StorageAdapter}
 */
export function createLocalStorageAdapter({
  uploadDir = './uploads',
  publicBaseUrl = 'http://localhost:3001/uploads',
} = {}) {
  return {
    backendName: 'local',
    async upload({ buffer, filename }) {
      await mkdir(uploadDir, { recursive: true });
      const filePath = join(uploadDir, filename);
      await writeFile(filePath, buffer);
      const base = publicBaseUrl.replace(/\/$/, '');
      return { url: `${base}/${filename}`, key: filename };
    },
  };
}

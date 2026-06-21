import { createLocalStorageAdapter } from './localStorage.js';
import { createS3StorageAdapter } from './s3Storage.js';
import { createIpfsStorageAdapter } from './ipfsStorage.js';

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {import('./storageAdapter.js').StorageAdapter}
 */
export function createStorageAdapter(env = process.env) {
  const backend = (env.STORAGE_BACKEND ?? 'local').toLowerCase();

  switch (backend) {
    case 's3':
      return createS3StorageAdapter({
        bucket: env.S3_BUCKET,
        region: env.AWS_REGION,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL,
      });
    case 'ipfs':
      return createIpfsStorageAdapter({
        apiKey: env.IPFS_API_KEY,
        apiUrl: env.IPFS_API_URL,
        gatewayUrl: env.IPFS_GATEWAY_URL,
      });
    case 'local':
    default:
      return createLocalStorageAdapter({
        uploadDir: env.UPLOAD_DIR ?? './uploads',
        publicBaseUrl: env.UPLOAD_PUBLIC_BASE_URL ?? `http://localhost:${env.PORT ?? 3001}/uploads`,
      });
  }
}

export { createLocalStorageAdapter, createS3StorageAdapter, createIpfsStorageAdapter };

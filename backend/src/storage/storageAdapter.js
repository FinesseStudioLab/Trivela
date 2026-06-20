/**
 * @typedef {Object} StorageUploadResult
 * @property {string} url Public URL for the stored object
 * @property {string} [key] Storage key/path
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {(params: { buffer: Buffer, filename: string, mimeType: string }) => Promise<StorageUploadResult>} upload
 * @property {() => string} backendName
 */

export {};

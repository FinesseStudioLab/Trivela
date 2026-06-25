import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * @param {{ bucket: string, region?: string, publicBaseUrl?: string }} options
 * @returns {import('./storageAdapter.js').StorageAdapter}
 */
export function createS3StorageAdapter({
  bucket,
  region = process.env.AWS_REGION ?? 'us-east-1',
  publicBaseUrl,
} = {}) {
  if (!bucket) {
    throw new Error('S3_BUCKET is required when STORAGE_BACKEND=s3');
  }

  const client = new S3Client({ region });
  const baseUrl = publicBaseUrl ?? `https://${bucket}.s3.${region}.amazonaws.com`;

  return {
    backendName: 's3',
    async upload({ buffer, filename, mimeType }) {
      const key = `campaigns/${filename}`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ACL: 'public-read',
        }),
      );

      return { url: `${baseUrl.replace(/\/$/, '')}/${key}`, key };
    },
  };
}

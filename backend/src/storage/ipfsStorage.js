/**
 * IPFS storage via Pinata or web3.storage HTTP API.
 *
 * @param {{ apiKey: string, apiUrl?: string, gatewayUrl?: string }} options
 * @returns {import('./storageAdapter.js').StorageAdapter}
 */
export function createIpfsStorageAdapter({
  apiKey,
  apiUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS',
  gatewayUrl = 'https://gateway.pinata.cloud/ipfs',
} = {}) {
  if (!apiKey) {
    throw new Error('IPFS_API_KEY is required when STORAGE_BACKEND=ipfs');
  }

  return {
    backendName: 'ipfs',
    async upload({ buffer, filename, mimeType }) {
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mimeType }), filename);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`IPFS upload failed (${response.status}): ${body}`);
      }

      const result = await response.json();
      const cid = result.IpfsHash ?? result.cid ?? result.Hash;
      if (!cid) {
        throw new Error('IPFS upload response missing CID');
      }

      return { url: `${gatewayUrl.replace(/\/$/, '')}/${cid}`, key: cid };
    },
  };
}

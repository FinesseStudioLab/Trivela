// @ts-check
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Automated IPFS pinning for campaign assets (#1255).
 *
 * Pins a campaign's image, rules and badge JSON, then a metadata document that
 * links them by `ipfs://` CID, through a pinning provider (Pinata). Pins are
 * content-addressed and de-duplicated per campaign: re-pinning unchanged
 * content returns the stored CID without a provider call.
 */

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Stable JSON: object keys sorted, so equal content always hashes equally. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** @param {string | Buffer} data */
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Only public https image hosts may be fetched, so campaign data cannot point
 * the server at internal services (SSRF). Redirects are refused separately.
 *
 * @param {string} rawUrl
 * @returns {URL}
 */
export function assertPublicHttpsUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('imageUrl is not a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('imageUrl must use https');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isPrivateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    host,
  );
  const isPrivateV6 = isIP(host) === 6 && /^(::1?$|f[cd]|fe80)/.test(host);
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    isPrivateV4 ||
    isPrivateV6
  ) {
    throw new Error('imageUrl must point to a public host');
  }
  return url;
}

/**
 * Pinata provider (https://docs.pinata.cloud). Authenticates with a JWT.
 *
 * @param {{ jwt: string, baseUrl?: string, fetchImpl?: typeof fetch }} options
 */
export function createPinataProvider({
  jwt,
  baseUrl = 'https://api.pinata.cloud',
  fetchImpl = fetch,
}) {
  if (!jwt) throw new Error('PINATA_JWT is required');
  const base = baseUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${jwt}` };

  /** @param {Response} res */
  async function parse(res) {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = /** @type {Error & { status?: number }} */ (
        new Error(`Pinata request failed (${res.status}): ${body.slice(0, 200)}`)
      );
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (!json?.IpfsHash) throw new Error('Pinata response missing IpfsHash');
    return { cid: String(json.IpfsHash), size: Number(json.PinSize ?? 0) };
  }

  return {
    name: 'pinata',
    /** @param {unknown} content @param {{ name: string }} meta */
    async pinJson(content, { name }) {
      const res = await fetchImpl(`${base}/pinning/pinJSONToIPFS`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinataContent: content, pinataMetadata: { name } }),
      });
      return parse(res);
    },
    /** @param {Buffer} buffer @param {{ name: string, mimeType: string }} meta */
    async pinFile(buffer, { name, mimeType }) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mimeType }), name);
      form.append('pinataMetadata', JSON.stringify({ name }));
      const res = await fetchImpl(`${base}/pinning/pinFileToIPFS`, {
        method: 'POST',
        headers,
        body: form,
      });
      return parse(res);
    },
  };
}

/**
 * @param {{
 *   db: InstanceType<import('better-sqlite3')>,
 *   provider: ReturnType<typeof createPinataProvider>,
 *   fetchImpl?: typeof fetch,
 *   logger?: { info?: Function, warn?: Function },
 *   maxImageBytes?: number,
 *   attempts?: number,
 *   retryBaseMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} options
 */
export function createIpfsPinService({
  db,
  provider,
  fetchImpl = fetch,
  logger = console,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  attempts = 3,
  retryBaseMs = 250,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const findStmt = db.prepare(
    'SELECT * FROM ipfs_pins WHERE campaign_id = ? AND kind = ? AND content_hash = ?',
  );
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO ipfs_pins
      (campaign_id, kind, content_hash, cid, name, size_bytes, provider, created_at)
    VALUES (@campaignId, @kind, @contentHash, @cid, @name, @size, @provider, @createdAt)
  `);

  /** Retry transient provider failures (429, 5xx, network) with backoff. */
  async function withRetry(/** @type {() => Promise<any>} */ fn) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const status = /** @type {any} */ (err)?.status;
        const transient = status === undefined || status === 429 || status >= 500;
        if (!transient || attempt === attempts) break;
        await sleep(retryBaseMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  /** @returns {ReturnType<typeof rowToPin>} */
  function store(campaignId, kind, contentHash, name, { cid, size }) {
    insertStmt.run({
      campaignId: String(campaignId),
      kind,
      contentHash,
      cid,
      name,
      size,
      provider: provider.name,
      createdAt: new Date().toISOString(),
    });
    return rowToPin(findStmt.get(String(campaignId), kind, contentHash));
  }

  /**
   * @param {string | number} campaignId
   * @param {'metadata' | 'rules' | 'badge'} kind
   * @param {unknown} content
   */
  async function pinJsonDocument(campaignId, kind, content) {
    const canonical = canonicalJson(content);
    const contentHash = sha256(canonical);
    const existing = findStmt.get(String(campaignId), kind, contentHash);
    if (existing) return { ...rowToPin(existing), cached: true };

    const name = `campaign-${campaignId}-${kind}.json`;
    const result = await withRetry(() => provider.pinJson(JSON.parse(canonical), { name }));
    logger.info?.({ campaignId, kind, cid: result.cid }, 'ipfs:pinned');
    return { ...store(campaignId, kind, contentHash, name, result), cached: false };
  }

  /** @param {string | number} campaignId @param {string} imageUrl */
  async function pinImage(campaignId, imageUrl) {
    const url = assertPublicHttpsUrl(imageUrl);
    const res = await fetchImpl(url, { redirect: 'error', headers: { Accept: 'image/*' } });
    if (!res.ok) throw new Error(`Image download failed (${res.status})`);
    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!mimeType.startsWith('image/'))
      throw new Error(`Refusing to pin non-image content (${mimeType || 'unknown'})`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxImageBytes) throw new Error(`Image exceeds ${maxImageBytes} bytes`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxImageBytes) throw new Error(`Image exceeds ${maxImageBytes} bytes`);

    const contentHash = sha256(buffer);
    const existing = findStmt.get(String(campaignId), 'image', contentHash);
    if (existing) return { ...rowToPin(existing), cached: true };

    const ext = mimeType.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'img';
    const name = `campaign-${campaignId}-image.${ext}`;
    const result = await withRetry(() => provider.pinFile(buffer, { name, mimeType }));
    logger.info?.({ campaignId, kind: 'image', cid: result.cid }, 'ipfs:pinned');
    return { ...store(campaignId, 'image', contentHash, name, result), cached: false };
  }

  /**
   * Pin everything a campaign publishes: image, rules, badge, then the metadata
   * document linking them. An image failure is reported but does not stop the
   * JSON documents from being pinned.
   *
   * @param {{ id: string | number, name: string, description?: string, imageUrl?: string | null,
   *   category?: string | null, tags?: string[], rewardPerAction?: number, startDate?: string | null,
   *   endDate?: string | null }} campaign
   */
  async function pinCampaign(campaign) {
    const id = campaign.id;
    /** @type {Array<Record<string, any>>} */
    const pins = [];
    /** @type {Array<{ kind: string, error: string }>} */
    const errors = [];

    let imageCid = null;
    if (campaign.imageUrl) {
      try {
        const pin = await pinImage(id, campaign.imageUrl);
        pins.push(pin);
        imageCid = pin.cid;
      } catch (err) {
        errors.push({ kind: 'image', error: err instanceof Error ? err.message : String(err) });
        logger.warn?.({ campaignId: id, err }, 'ipfs:image_pin_failed');
      }
    }

    const rules = await pinJsonDocument(id, 'rules', {
      rewardPerAction: campaign.rewardPerAction ?? 0,
      startDate: campaign.startDate ?? null,
      endDate: campaign.endDate ?? null,
      category: campaign.category ?? null,
    });
    pins.push(rules);

    const badge = await pinJsonDocument(id, 'badge', {
      name: `${campaign.name} participant`,
      description: `Awarded for participating in ${campaign.name}`,
      image: imageCid ? `ipfs://${imageCid}` : null,
      attributes: [{ trait_type: 'campaign', value: String(id) }],
    });
    pins.push(badge);

    const metadata = await pinJsonDocument(id, 'metadata', {
      schema: 'trivela.campaign/1',
      id: String(id),
      name: campaign.name,
      description: campaign.description ?? '',
      category: campaign.category ?? null,
      tags: campaign.tags ?? [],
      image: imageCid ? `ipfs://${imageCid}` : null,
      rules: `ipfs://${rules.cid}`,
      badge: `ipfs://${badge.cid}`,
    });
    pins.push(metadata);

    return { metadataCid: metadata.cid, metadataUri: `ipfs://${metadata.cid}`, pins, errors };
  }

  /** @param {string | number} campaignId */
  function list(campaignId) {
    return db
      .prepare('SELECT * FROM ipfs_pins WHERE campaign_id = ? ORDER BY id DESC')
      .all(String(campaignId))
      .map(rowToPin);
  }

  return { pinCampaign, pinImage, pinJsonDocument, list };
}

function rowToPin(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    kind: row.kind,
    cid: row.cid,
    uri: `ipfs://${row.cid}`,
    name: row.name,
    sizeBytes: row.size_bytes,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

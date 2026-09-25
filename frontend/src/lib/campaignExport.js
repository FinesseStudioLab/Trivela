/**
 * Campaign analytics export helpers (#1207).
 *
 * Two kinds of export:
 * - Stats: the aggregated analytics already loaded on the page, serialized
 *   client-side to CSV or JSON.
 * - Participants: the full participant list (addresses, registration
 *   timestamps, points credited/claimed, referrer) from the backend's
 *   `GET /api/v1/campaigns/:id/export?format=csv|json`, which requires the
 *   admin API key.
 */
import { apiUrl } from '../config';

export const EXPORT_FORMATS = ['csv', 'json'];
export const ADMIN_API_KEY_STORAGE_KEY = 'trivela_admin_api_key';

/** RFC 4180 field escaping. */
export function escapeCsvField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(fields) {
  return fields.map(escapeCsvField).join(',');
}

export function statsToCsv(stats) {
  const lines = [csvRow(['section', 'date', 'credited', 'claimed', 'count'])];
  for (const row of stats?.registrationsByDay || []) {
    lines.push(csvRow(['registrations', row.date, '', '', row.count]));
  }
  for (const row of stats?.pointsByDay || []) {
    lines.push(csvRow(['points', row.date, row.credited, row.claimed, '']));
  }
  const s = stats?.summary ?? {};
  lines.push(
    csvRow([
      'summary',
      '',
      '',
      '',
      `participants=${s.totalParticipants};points=${s.totalPoints};claimRate=${s.claimRate}`,
    ]),
  );
  return lines.join('\n') + '\n';
}

export function statsToJson(stats, { campaignId, campaignName, range } = {}) {
  return JSON.stringify(
    {
      campaign: { id: campaignId ?? null, name: campaignName ?? null },
      range: range ?? null,
      exportedAt: new Date().toISOString(),
      summary: stats?.summary ?? null,
      registrationsByDay: stats?.registrationsByDay ?? [],
      pointsByDay: stats?.pointsByDay ?? [],
    },
    null,
    2,
  );
}

/** Triggers a browser download of `content` as `filename`. */
export function downloadBlob(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getStoredAdminApiKey() {
  try {
    return window.sessionStorage.getItem(ADMIN_API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

const ERROR_MESSAGES = {
  400: 'Invalid export request.',
  401: 'Admin API key is missing or invalid.',
  403: 'Admin API key is missing or invalid.',
  404: 'Campaign not found.',
  429: 'Export limit reached (5 per campaign per hour). Try again later.',
};

/**
 * Downloads the full participant export from the backend.
 *
 * @param {{ campaignId: string|number, format: 'csv'|'json', apiKey?: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<string>} the downloaded filename.
 * @throws {Error} with a user-facing message on validation or HTTP failure.
 */
export async function downloadParticipantExport({
  campaignId,
  format,
  apiKey = getStoredAdminApiKey(),
  fetchImpl = fetch,
}) {
  if (!EXPORT_FORMATS.includes(format)) {
    throw new Error(`Unsupported export format: ${format}`);
  }
  if (campaignId === undefined || campaignId === null || campaignId === '') {
    throw new Error('Missing campaign id.');
  }
  if (!apiKey) {
    throw new Error('Admin API key required. Sign in as an admin to export participants.');
  }

  const res = await fetchImpl(
    apiUrl(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/export?format=${format}`),
    { headers: { 'x-api-key': apiKey } },
  );
  if (!res.ok) {
    throw new Error(ERROR_MESSAGES[res.status] ?? `Export failed (HTTP ${res.status}).`);
  }

  const filename = `campaign-${campaignId}-participants.${format}`;
  downloadBlob(
    await res.blob(),
    filename,
    format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
  );
  return filename;
}

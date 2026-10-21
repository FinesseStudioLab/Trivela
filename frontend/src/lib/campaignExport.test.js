import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_API_KEY_STORAGE_KEY,
  downloadParticipantExport,
  escapeCsvField,
  statsToCsv,
  statsToJson,
} from './campaignExport';

const STATS = {
  summary: { totalParticipants: 3, totalPoints: 120, claimRate: 0.5 },
  registrationsByDay: [{ date: '2026-09-01', count: 2 }],
  pointsByDay: [{ date: '2026-09-01', credited: 100, claimed: 50 }],
};

describe('escapeCsvField', () => {
  it('quotes fields containing commas, quotes or newlines', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(0)).toBe('0');
  });
});

describe('statsToCsv', () => {
  it('serializes daily series and summary', () => {
    const lines = statsToCsv(STATS).trim().split('\n');
    expect(lines[0]).toBe('section,date,credited,claimed,count');
    expect(lines).toContain('registrations,2026-09-01,,,2');
    expect(lines).toContain('points,2026-09-01,100,50,');
    expect(lines.at(-1)).toBe('summary,,,,participants=3;points=120;claimRate=0.5');
  });

  it('tolerates missing sections', () => {
    expect(statsToCsv({}).split('\n')[0]).toBe('section,date,credited,claimed,count');
  });
});

describe('statsToJson', () => {
  it('includes campaign metadata and series', () => {
    const parsed = JSON.parse(
      statsToJson(STATS, { campaignId: '7', campaignName: 'Launch', range: '30d' }),
    );
    expect(parsed.campaign).toEqual({ id: '7', name: 'Launch' });
    expect(parsed.range).toBe('30d');
    expect(parsed.summary.totalParticipants).toBe(3);
    expect(parsed.pointsByDay).toHaveLength(1);
    expect(typeof parsed.exportedAt).toBe('string');
  });
});

describe('downloadParticipantExport', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const okFetch = () =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['x']) });

  it('rejects unsupported formats', async () => {
    await expect(
      downloadParticipantExport({ campaignId: 1, format: 'xml', apiKey: 'k' }),
    ).rejects.toThrow(/Unsupported export format/);
  });

  it('requires an admin API key', async () => {
    await expect(downloadParticipantExport({ campaignId: 1, format: 'csv' })).rejects.toThrow(
      /Admin API key required/,
    );
  });

  it('uses the stored admin key and downloads the file', async () => {
    window.sessionStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, 'secret');
    const fetchImpl = okFetch();
    const filename = await downloadParticipantExport({ campaignId: 7, format: 'json', fetchImpl });
    expect(filename).toBe('campaign-7-participants.json');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain('/api/v1/campaigns/7/export?format=json');
    expect(init.headers['x-api-key']).toBe('secret');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it.each([
    [401, /API key is missing or invalid/],
    [404, /Campaign not found/],
    [429, /Export limit reached/],
    [500, /HTTP 500/],
  ])('maps HTTP %i to a readable error', async (status, pattern) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status });
    await expect(
      downloadParticipantExport({ campaignId: 7, format: 'csv', apiKey: 'k', fetchImpl }),
    ).rejects.toThrow(pattern);
  });
});

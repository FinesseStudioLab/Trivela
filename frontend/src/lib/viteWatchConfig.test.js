import { describe, expect, it } from 'vitest';
import { getWatchOptions } from './viteWatchConfig';

describe('getWatchOptions', () => {
  it('returns no explicit watch options when polling is not requested', () => {
    expect(getWatchOptions({})).toEqual({});
  });

  it('leaves native watching enabled when CHOKIDAR_USEPOLLING is unset or falsy', () => {
    expect(getWatchOptions({ CHOKIDAR_USEPOLLING: 'false' })).toEqual({});
    expect(getWatchOptions({ CHOKIDAR_USEPOLLING: undefined })).toEqual({});
  });

  it('enables polling when CHOKIDAR_USEPOLLING=true, for bind-mounted Docker volumes', () => {
    expect(getWatchOptions({ CHOKIDAR_USEPOLLING: 'true' })).toEqual({
      usePolling: true,
      interval: 300,
    });
  });
});

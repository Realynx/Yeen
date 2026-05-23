import { discoverTorrentHashByTag } from './torrent-hash-discovery-helpers';

function extractHashFromRecord(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const hash = (value as Record<string, unknown>).hash;
  return typeof hash === 'string' && hash ? hash : null;
}

describe('torrent-hash-discovery-helpers', () => {
  it('returns the first discovered hash from list results', async () => {
    let currentMs = 0;
    const sleep = jest.fn((durationMs: number) => {
      currentMs += durationMs;
      return Promise.resolve();
    });
    const listTorrentsByTag = jest.fn(() =>
      Promise.resolve([{ hash: '' }, { hash: 'abc123' }]),
    );

    const result = await discoverTorrentHashByTag({
      tag: 'yeen-trace-tag',
      timeoutMs: 1000,
      pollIntervalMs: 250,
      listTorrentsByTag,
      extractHash: extractHashFromRecord,
      nowMs: () => currentMs,
      sleep,
    });

    expect(result).toBe('abc123');
    expect(listTorrentsByTag).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('continues polling after list errors and invokes error callback', async () => {
    let currentMs = 0;
    const sleep = jest.fn((durationMs: number) => {
      currentMs += durationMs;
      return Promise.resolve();
    });
    const listTorrentsByTag = jest
      .fn<Promise<unknown[]>, [string]>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([{ hash: 'found-after-retry' }]);
    const onListError = jest.fn();

    const result = await discoverTorrentHashByTag({
      tag: 'yeen-trace-tag',
      timeoutMs: 1000,
      pollIntervalMs: 250,
      listTorrentsByTag,
      extractHash: extractHashFromRecord,
      onListError,
      nowMs: () => currentMs,
      sleep,
    });

    expect(result).toBe('found-after-retry');
    expect(listTorrentsByTag).toHaveBeenCalledTimes(2);
    expect(onListError).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('returns null after timeout when no hash is discovered', async () => {
    let currentMs = 0;
    const sleep = jest.fn((durationMs: number) => {
      currentMs += durationMs;
      return Promise.resolve();
    });
    const listTorrentsByTag = jest
      .fn<Promise<unknown[]>, [string]>()
      .mockResolvedValue([{ hash: '' }]);

    const result = await discoverTorrentHashByTag({
      tag: 'yeen-trace-tag',
      timeoutMs: 500,
      pollIntervalMs: 200,
      listTorrentsByTag,
      extractHash: extractHashFromRecord,
      nowMs: () => currentMs,
      sleep,
    });

    expect(result).toBeNull();
    expect(listTorrentsByTag).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});

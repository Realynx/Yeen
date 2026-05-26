import { MediaTorrentIntakePollingService } from './media-torrent-intake-polling.service';

function createDeferred<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MediaTorrentIntakePollingService', () => {
  it('waits for an in-flight intake poll during module shutdown', async () => {
    const candidateDeferred = createDeferred<void>();
    const listTorrents = jest.fn().mockResolvedValue({
      items: [
        {
          hash: 'HASH-ONE',
          progress: 0.5,
          name: 'Example Torrent',
        },
      ],
    });
    const processAutomaticTorrentIntakeCandidate = jest
      .fn()
      .mockReturnValue(candidateDeferred.promise);

    const service = new MediaTorrentIntakePollingService(
      {
        get: jest.fn().mockReturnValue({ status: 'idle' }),
      } as unknown as import('../../../infrastructure/stores/media-scan.store').MediaScanStore,
      {
        listTorrents,
      } as unknown as import('../../../../torrent/application/services/torrent.service').TorrentService,
      {
        processAutomaticTorrentIntakeCandidate,
      } as unknown as import('./media-torrent-intake-candidate.service').MediaTorrentIntakeCandidateService,
    );

    service.onModuleInit();
    await flushAsyncWork();

    expect(listTorrents).toHaveBeenCalledTimes(1);
    expect(processAutomaticTorrentIntakeCandidate).toHaveBeenCalledWith(
      'hash-one',
      60_000,
    );

    let shutdownCompleted = false;
    const shutdownPromise = service.onModuleDestroy().then(() => {
      shutdownCompleted = true;
    });

    await flushAsyncWork();
    expect(shutdownCompleted).toBe(false);

    candidateDeferred.resolve();
    await shutdownPromise;

    expect(shutdownCompleted).toBe(true);
  });
});

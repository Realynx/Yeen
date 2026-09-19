import { HttpStatus, Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProgressivePlaybackSourceRegistry } from '../../../core/application/extensions/progressive-playback-source';
import type { MediaService } from '../../../media/application/services/media.service';
import type { HlsSessionStore } from '../../infrastructure/stores/hls-session.store';
import {
  createSessionValue,
  findReusableSessionValue,
  HlsStartSingleFlight,
} from './hls-session-lifecycle.helper';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('HlsStartSingleFlight', () => {
  it('coalesces ordinary starts for the same key', async () => {
    const coordinator = new HlsStartSingleFlight<string>();
    const pending = deferred<string>();
    const start = jest.fn(() => pending.promise);

    const first = coordinator.run('same', false, start);
    const second = coordinator.run('same', false, start);

    expect(first).toBe(second);
    expect(start).toHaveBeenCalledTimes(1);
    pending.resolve('session-a');
    await expect(Promise.all([first, second])).resolves.toEqual([
      'session-a',
      'session-a',
    ]);
  });

  it('queues one forced start behind an ordinary start', async () => {
    const coordinator = new HlsStartSingleFlight<string>();
    const ordinary = deferred<string>();
    const forced = deferred<string>();
    const start = jest
      .fn<Promise<string>, [boolean]>()
      .mockImplementationOnce(() => ordinary.promise)
      .mockImplementationOnce(() => forced.promise);

    const first = coordinator.run('same', false, start);
    const forcedOne = coordinator.run('same', true, start);
    const forcedTwo = coordinator.run('same', true, start);
    const laterOrdinary = coordinator.run('same', false, start);

    expect(start).toHaveBeenCalledTimes(1);
    ordinary.resolve('ordinary');
    await expect(first).resolves.toBe('ordinary');
    await Promise.resolve();
    expect(start).toHaveBeenCalledTimes(2);
    expect(forcedOne).toBe(forcedTwo);
    expect(laterOrdinary).toBe(forcedOne);
    forced.resolve('forced');
    await expect(Promise.all([forcedOne, laterOrdinary])).resolves.toEqual([
      'forced',
      'forced',
    ]);
  });

  it('does not poison a key after failure', async () => {
    const coordinator = new HlsStartSingleFlight<string>();
    const start = jest
      .fn<Promise<string>, [boolean]>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce('recovered');

    await expect(coordinator.run('same', false, start)).rejects.toThrow(
      'failed',
    );
    await expect(coordinator.run('same', false, start)).resolves.toBe(
      'recovered',
    );
    expect(start).toHaveBeenCalledTimes(2);
  });
});

describe('createSessionValue media kind', () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'yeen-audio-hls-session-'));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it('creates an audio-only music session without x264 arguments', async () => {
    const sourcePath = join(scratchDir, 'track.flac');
    await writeFile(sourcePath, Buffer.alloc(32, 1));
    const reconcileSourceDurationSeconds = jest.fn().mockResolvedValue(13);
    const mediaService = {
      getById: jest.fn().mockResolvedValue({
        id: 'track-1',
        libraryType: 'music',
        digitalMediaType: 'audio',
        filePath: sourcePath,
        relativePath: 'Artist/Album/Track.flac',
        mediaDetails: { frameRate: null },
      }),
      resolveMediaFilePath: jest.fn().mockResolvedValue(sourcePath),
      reconcileSourceDurationSeconds,
    } as unknown as MediaService;
    const progressivePlaybackSources = {
      resolveSource: jest.fn().mockResolvedValue(null),
    } as unknown as ProgressivePlaybackSourceRegistry;

    const session = await createSessionValue(
      'track-1',
      2,
      scratchDir,
      11,
      mediaService,
      progressivePlaybackSources,
      { debug: jest.fn() } as unknown as Logger,
      {
        ffmpegPath: 'ffmpeg',
        hlsSegmentSeconds: 6,
        transcodePreset: 'veryfast',
        transcodeCrf: 22,
        transcodeRateControlBufferSeconds: 3,
        videoEncoder: 'cpu',
      },
      {
        maxVideoBitrateKbps: 4000,
        audioBitrateKbps: 192,
        maxOutputHeight: 1080,
      },
    );

    expect(session).toEqual(
      expect.objectContaining({
        mediaKind: 'audio',
        formatVersion: 11,
        totalDurationSeconds: 13,
        totalSegments: 3,
        audioMapSpecifier: '0:2?',
        keyFrameInterval: 0,
        videoArgs: [],
      }),
    );
    expect(session.audioArgs).toEqual(
      expect.arrayContaining(['-c:a', 'aac', '-b:a', '192k']),
    );
    expect(reconcileSourceDurationSeconds).toHaveBeenCalledWith(
      'track-1',
      sourcePath,
      { mayBePartial: false },
    );
  });

  it('fails before advertising an HLS session when a normal media source is missing', async () => {
    const sourcePath = join(scratchDir, 'deleted-movie.mkv');
    const reconcileSourceDurationSeconds = jest.fn().mockResolvedValue(120);
    const mediaService = {
      getById: jest.fn().mockResolvedValue({
        id: 'movie-1',
        libraryType: 'video',
        digitalMediaType: 'video',
        filePath: sourcePath,
        relativePath: 'Movies/deleted-movie.mkv',
        mediaDetails: { frameRate: 24 },
      }),
      resolveMediaFilePath: jest.fn().mockResolvedValue(sourcePath),
      reconcileSourceDurationSeconds,
    } as unknown as MediaService;
    const progressivePlaybackSources = {
      resolveSource: jest.fn().mockResolvedValue(null),
    } as unknown as ProgressivePlaybackSourceRegistry;

    await expect(
      createSessionValue(
        'movie-1',
        null,
        scratchDir,
        12,
        mediaService,
        progressivePlaybackSources,
        { debug: jest.fn(), warn: jest.fn() } as unknown as Logger,
        {
          ffmpegPath: 'ffmpeg',
          hlsSegmentSeconds: 6,
          transcodePreset: 'veryfast',
          transcodeCrf: 22,
          transcodeRateControlBufferSeconds: 3,
          videoEncoder: 'nvidia',
        },
        {
          maxVideoBitrateKbps: 4000,
          audioBitrateKbps: 192,
          maxOutputHeight: 1080,
        },
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_GATEWAY });
    expect(reconcileSourceDurationSeconds).not.toHaveBeenCalled();
  });
});

describe('findReusableSessionValue segment compatibility', () => {
  it('discards a cached session when segment duration settings changed', async () => {
    const staleSession = {
      sessionId: 'stale-session',
      formatVersion: 11,
      segmentSeconds: 10,
      outputDir: '/tmp/stale-session',
    };
    const deleteSession = jest.fn().mockReturnValue(staleSession);
    const cancelForSession = jest.fn().mockResolvedValue(undefined);
    const hlsSessionStore = {
      findReusableByMediaId: jest.fn().mockReturnValue(staleSession),
      delete: deleteSession,
    } as unknown as HlsSessionStore;
    const segmentTranscoder = {
      cancelForSession,
    } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder;

    await expect(
      findReusableSessionValue(
        'media-1',
        false,
        null,
        {
          maxVideoBitrateKbps: 4000,
          audioBitrateKbps: 192,
          maxOutputHeight: 1080,
        },
        3,
        'cpu',
        hlsSessionStore,
        11,
        segmentTranscoder,
      ),
    ).resolves.toBeNull();

    expect(deleteSession).toHaveBeenCalledWith('stale-session');
    expect(cancelForSession).toHaveBeenCalledWith('stale-session');
  });

  it('discards a cached session when the resolved encoder changes', async () => {
    const staleSession = {
      sessionId: 'cpu-session',
      formatVersion: 11,
      segmentSeconds: 3,
      videoEncoder: 'cpu',
      outputDir: '/tmp/cpu-session',
    };
    const deleteSession = jest.fn().mockReturnValue(staleSession);
    const cancelForSession = jest.fn().mockResolvedValue(undefined);
    const hlsSessionStore = {
      findReusableByMediaId: jest.fn().mockReturnValue(staleSession),
      delete: deleteSession,
    } as unknown as HlsSessionStore;
    const segmentTranscoder = {
      cancelForSession,
    } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder;

    await expect(
      findReusableSessionValue(
        'media-1',
        false,
        null,
        {
          maxVideoBitrateKbps: 4000,
          audioBitrateKbps: 192,
          maxOutputHeight: 1080,
        },
        3,
        'nvidia',
        hlsSessionStore,
        11,
        segmentTranscoder,
      ),
    ).resolves.toBeNull();

    expect(deleteSession).toHaveBeenCalledWith('cpu-session');
    expect(cancelForSession).toHaveBeenCalledWith('cpu-session');
  });
});

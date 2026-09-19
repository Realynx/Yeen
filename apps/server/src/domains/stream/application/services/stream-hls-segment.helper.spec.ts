import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HlsSession } from '../../infrastructure/stores/hls-session.store';
import {
  SegmentTranscodeCancelledError,
  SegmentTranscodeQueueOverloadedError,
  type SegmentTranscodeRequest,
} from './hls/hls-segment-transcoder.service';
import { serveHlsSegmentValue } from './stream-hls-segment.helper';

function createSession(overrides: Partial<HlsSession> = {}): HlsSession {
  return {
    sessionId: 'session-1',
    mediaId: 'media-1',
    outputDir: 'out',
    manifestPath: 'manifest.m3u8',
    startedAt: new Date().toISOString(),
    formatVersion: 11,
    mediaKind: 'video',
    sourceFilePath: 'source.mkv',
    progressiveSource: null,
    ffmpegPath: 'ffmpeg',
    segmentSeconds: 6,
    totalDurationSeconds: 60,
    totalSegments: 10,
    selectedAudioStreamIndex: null,
    maxVideoBitrateKbps: 4000,
    audioBitrateKbps: 128,
    maxOutputHeight: 1080,
    audioMapSpecifier: '0:a:0?',
    videoEncoder: 'cpu',
    inputArgs: [],
    videoArgs: [],
    audioArgs: [],
    keyFrameInterval: 150,
    ...overrides,
  };
}

describe('serveHlsSegmentValue', () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'yeen-stream-segment-test-'));
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it('maps transcoder overload to retryable 503 with retry headers', async () => {
    const sourceFile = join(scratchDir, 'source.mkv');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));

    const responseHeaders = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string) {
        responseHeaders.set(name, value);
      },
    } as unknown as import('express').Response;

    const segmentTranscoder = {
      ensureSegment: jest
        .fn()
        .mockRejectedValue(new SegmentTranscodeQueueOverloadedError(3, 12, 8)),
    };

    const call = serveHlsSegmentValue({
      session: createSession({
        outputDir: scratchDir,
        manifestPath: join(scratchDir, 'master.m3u8'),
        sourceFilePath: sourceFile,
      }),
      fileName: 'segment_00000.ts',
      fullPath: join(scratchDir, 'segment_00000.ts'),
      response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder:
        segmentTranscoder as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    await expect(call).rejects.toBeInstanceOf(HttpException);

    try {
      await call;
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    expect(responseHeaders.get('X-Yeen-Hls-Overloaded')).toBe('1');
    expect(responseHeaders.get('Retry-After')).toBe('3');
    expect(responseHeaders.get('Cache-Control')).toBe('no-store');
  });

  it('prefetches a 30-second media window instead of a fixed segment count', async () => {
    const sourceFile = join(scratchDir, 'source.mkv');
    const segmentFile = join(scratchDir, 'segment_00000.ts');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    await writeFile(segmentFile, Buffer.alloc(32, 1));
    const prefetchSegments = jest.fn<
      void,
      [requests: SegmentTranscodeRequest[]]
    >();
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & { setHeader: jest.Mock };
    response.setHeader = jest.fn();

    await serveHlsSegmentValue({
      session: createSession({
        outputDir: scratchDir,
        sourceFilePath: sourceFile,
        segmentSeconds: 3,
        totalDurationSeconds: 300,
        totalSegments: 100,
      }),
      fileName: 'segment_00000.ts',
      fullPath: segmentFile,
      response: response as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment: jest.fn().mockResolvedValue(undefined),
        prefetchSegments,
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    const requests = prefetchSegments.mock.calls[0]?.[0] ?? [];
    expect(requests.map((request) => request.segmentIndex)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(requests.at(-1)?.startSeconds).toBe(27);
  });

  it('muxes AAC for a compatibility segment while continuous browser audio is active', async () => {
    const sourceFile = join(scratchDir, 'source.mkv');
    const segmentFile = join(scratchDir, 'segment_00000.ts');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    await writeFile(segmentFile, Buffer.alloc(32, 1));
    const ensureSegment = jest.fn().mockResolvedValue(undefined);
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & { setHeader: jest.Mock };
    response.setHeader = jest.fn();

    await serveHlsSegmentValue({
      session: createSession({
        outputDir: scratchDir,
        sourceFilePath: sourceFile,
        continuousAudio: true,
      }),
      fileName: 'segment_00000.ts',
      fullPath: segmentFile,
      response: response as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment,
        prefetchSegments: jest.fn(),
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      forceMuxedAudio: true,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    expect(ensureSegment).toHaveBeenCalledWith(
      expect.objectContaining({ includeAudio: true }),
    );
  });

  it('skips partial-file availability sampling for normal library media', async () => {
    const sourceFile = join(scratchDir, 'source.mkv');
    const segmentFile = join(scratchDir, 'segment_00000.ts');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    await writeFile(segmentFile, Buffer.alloc(32, 1));
    const assertSegmentReadable = jest.fn().mockResolvedValue(undefined);

    const call = serveHlsSegmentValue({
      session: createSession({
        sourceFilePath: sourceFile,
        progressiveSource: null,
      }),
      fileName: 'segment_00000.ts',
      fullPath: segmentFile,
      response: {
        setHeader: jest.fn(),
      } as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable,
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment: jest
          .fn()
          .mockRejectedValue(
            new SegmentTranscodeQueueOverloadedError(3, 12, 8),
          ),
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    await expect(call).rejects.toBeInstanceOf(HttpException);

    expect(assertSegmentReadable).not.toHaveBeenCalled();
  });

  it('maps cancelled sessions to a non-cacheable 404', async () => {
    const sourceFile = join(scratchDir, 'source.mkv');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    const responseHeaders = new Map<string, string>();

    const call = serveHlsSegmentValue({
      session: createSession({ sourceFilePath: sourceFile }),
      fileName: 'segment_00000.ts',
      fullPath: join(scratchDir, 'segment_00000.ts'),
      response: {
        setHeader(name: string, value: string) {
          responseHeaders.set(name, value);
        },
      } as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment: jest
          .fn()
          .mockRejectedValue(new SegmentTranscodeCancelledError('session-1')),
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    await expect(call).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    expect(responseHeaders.get('Cache-Control')).toBe('no-store');
  });

  it('marks deterministic transcode failures as terminal instead of retryable', async () => {
    const sourceFile = join(scratchDir, 'ten-bit-source.mkv');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    const responseHeaders = new Map<string, string>();

    const call = serveHlsSegmentValue({
      session: createSession({
        sourceFilePath: sourceFile,
        videoEncoder: 'nvidia',
      }),
      fileName: 'segment_00000.ts',
      fullPath: join(scratchDir, 'segment_00000.ts'),
      response: {
        setHeader(name: string, value: string) {
          responseHeaders.set(name, value);
        },
      } as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment: jest
          .fn()
          .mockRejectedValue(
            new Error('Unsupported codec profile for the active encoder.'),
          ),
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    await expect(call).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
    });
    expect(responseHeaders.get('X-Yeen-Hls-Permanent-Failure')).toBe('1');
    expect(responseHeaders.get('Cache-Control')).toBe('no-store');
  });

  it('falls back to software conversion with NVENC after a title-specific CUDA failure', async () => {
    const sourceFile = join(scratchDir, 'ten-bit-source.mkv');
    const segmentFile = join(scratchDir, 'segment_00000.ts');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    const session = createSession({
      sourceFilePath: sourceFile,
      videoEncoder: 'nvidia',
      inputArgs: ['-hwaccel', 'cuda'],
      videoArgs: ['-c:v', 'h264_nvenc'],
      softwareNvencFallbackVideoArgs: [
        '-vf',
        'scale=-2:1080,format=yuv420p',
        '-c:v',
        'h264_nvenc',
      ],
      cpuFallbackVideoArgs: ['-c:v', 'libx264'],
    });
    const ensureSegment = jest
      .fn<Promise<void>, [SegmentTranscodeRequest]>()
      .mockRejectedValueOnce(
        new Error(
          "Impossible to convert between the formats supported by the filter 'Parsed_scale_cuda_1' and the filter 'auto_scaler_0'",
        ),
      )
      .mockImplementationOnce(async (request: SegmentTranscodeRequest) => {
        await writeFile(request.segmentPath, Buffer.alloc(32, 1));
      });
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & { setHeader: jest.Mock };
    response.setHeader = jest.fn();

    await serveHlsSegmentValue({
      session,
      fileName: 'segment_00000.ts',
      fullPath: segmentFile,
      response: response as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment,
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    expect(ensureSegment).toHaveBeenCalledTimes(2);
    expect(ensureSegment.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        inputArgs: [],
        videoArgs: [
          '-vf',
          'scale=-2:1080,format=yuv420p',
          '-c:v',
          'h264_nvenc',
        ],
      }),
    );
    expect(session.videoEncoder).toBe('nvidia');
    expect(session.videoArgs).toContain('h264_nvenc');
  });

  it('falls back to software decoding when the GPU cannot decode the source codec', async () => {
    const sourceFile = join(scratchDir, 'av1-source.mkv');
    const segmentFile = join(scratchDir, 'segment_00000.ts');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    const session = createSession({
      sourceFilePath: sourceFile,
      videoEncoder: 'nvidia',
      inputArgs: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
      videoArgs: ['-c:v', 'h264_nvenc'],
      softwareNvencFallbackVideoArgs: [
        '-vf',
        'scale=-2:1080,format=yuv420p',
        '-c:v',
        'h264_nvenc',
      ],
      cpuFallbackVideoArgs: ['-c:v', 'libx264'],
    });
    const ensureSegment = jest
      .fn<Promise<void>, [SegmentTranscodeRequest]>()
      .mockRejectedValueOnce(
        new Error(
          'ffmpeg exited 127 for segment 0: [vist#0:0/av1 @ 0000015a850b1240] ' +
            '[dec:av1 @ 0000015a84cc3a00] No device available for decoder: ' +
            'device type cuda needed for codec av1.',
        ),
      )
      .mockImplementationOnce(async (request: SegmentTranscodeRequest) => {
        await writeFile(request.segmentPath, Buffer.alloc(32, 1));
      });
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & { setHeader: jest.Mock };
    response.setHeader = jest.fn();

    await serveHlsSegmentValue({
      session,
      fileName: 'segment_00000.ts',
      fullPath: segmentFile,
      response: response as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment,
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    expect(ensureSegment).toHaveBeenCalledTimes(2);
    expect(ensureSegment.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ inputArgs: [] }),
    );
    expect(session.inputArgs).toEqual([]);
  });

  it('drops to CPU when hwaccel setup fails and no NVENC software path remains', async () => {
    const sourceFile = join(scratchDir, 'av1-source.mkv');
    const segmentFile = join(scratchDir, 'segment_00000.ts');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    const session = createSession({
      sourceFilePath: sourceFile,
      videoEncoder: 'nvidia',
      inputArgs: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'],
      videoArgs: ['-c:v', 'h264_nvenc'],
      cpuFallbackVideoArgs: ['-c:v', 'libx264'],
    });
    const ensureSegment = jest
      .fn<Promise<void>, [SegmentTranscodeRequest]>()
      .mockRejectedValueOnce(
        new Error(
          'ffmpeg exited 1 for segment 0: [av1 @ 0000015a84cc3a00] Failed ' +
            'setup for format cuda: hwaccel initialisation returned error.',
        ),
      )
      .mockImplementationOnce(async (request: SegmentTranscodeRequest) => {
        await writeFile(request.segmentPath, Buffer.alloc(32, 1));
      });
    const response = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Writable & { setHeader: jest.Mock };
    response.setHeader = jest.fn();

    await serveHlsSegmentValue({
      session,
      fileName: 'segment_00000.ts',
      fullPath: segmentFile,
      response: response as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment,
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    expect(ensureSegment).toHaveBeenCalledTimes(2);
    expect(session.videoEncoder).toBe('cpu');
    expect(session.videoArgs).toEqual(['-c:v', 'libx264']);
    expect(session.inputArgs).toEqual([]);
  });

  it('propagates audio-only session kind to the segment transcoder', async () => {
    const sourceFile = join(scratchDir, 'source.flac');
    await writeFile(sourceFile, Buffer.alloc(1024, 1));
    const ensureSegment = jest
      .fn()
      .mockRejectedValue(new SegmentTranscodeQueueOverloadedError(2, 12, 8));

    const call = serveHlsSegmentValue({
      session: createSession({
        mediaKind: 'audio',
        sourceFilePath: sourceFile,
        videoArgs: [],
      }),
      fileName: 'segment_00000.ts',
      fullPath: join(scratchDir, 'segment_00000.ts'),
      response: {
        setHeader: jest.fn(),
      } as unknown as import('express').Response,
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger,
      progressivePlaybackSources: {
        prioritize: jest.fn(),
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('../../../core/application/extensions/progressive-playback-source').ProgressivePlaybackSourceRegistry,
      segmentTranscoder: {
        ensureSegment,
      } as unknown as import('./hls/hls-segment-transcoder.service').HlsSegmentTranscoder,
      startSegmentRecoverableWindowMs: 30_000,
      maxStartSegmentRecoverableFailures: 4,
      resolveReachableSourcePath: jest.fn().mockResolvedValue(sourceFile),
    });

    await expect(call).rejects.toBeInstanceOf(HttpException);
    expect(ensureSegment).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaKind: 'audio',
        audioMapSpecifier: '0:a:0?',
        videoArgs: [],
      }),
    );
  });
});

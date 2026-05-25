import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HlsSession } from '../../infrastructure/stores/hls-session.store';
import { SegmentTranscodeQueueOverloadedError } from './hls/hls-segment-transcoder.service';
import { serveHlsSegmentValue } from './stream-hls-segment.helper';

function createSession(overrides: Partial<HlsSession> = {}): HlsSession {
  return {
    sessionId: 'session-1',
    mediaId: 'media-1',
    outputDir: 'out',
    manifestPath: 'manifest.m3u8',
    startedAt: new Date().toISOString(),
    formatVersion: 10,
    sourceFilePath: 'source.mkv',
    torrentHash: null,
    ffmpegPath: 'ffmpeg',
    segmentSeconds: 6,
    totalDurationSeconds: 60,
    totalSegments: 10,
    selectedAudioStreamIndex: null,
    maxVideoBitrateKbps: 4000,
    audioBitrateKbps: 128,
    maxOutputHeight: 1080,
    audioMapSpecifier: '0:a:0?',
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
      torrentService: {
        ensureSequentialDownload: jest.fn(),
      } as unknown as import('../../../torrent/application/services/torrent.service').TorrentService,
      availability: {
        assertSegmentReadable: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('./hls/torrent-data-availability.service').TorrentDataAvailabilityService,
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
});

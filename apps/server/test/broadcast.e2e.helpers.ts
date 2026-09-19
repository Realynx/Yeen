import { NotFoundException, type INestApplication } from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { BroadcastOwnerSessionStatus } from '@yeen/shared-contracts';
import { BroadcastSessionStore } from '../src/domains/broadcast/infrastructure/stores/broadcast-session.store';
import { BroadcastSession } from '../src/domains/broadcast/domain/entities/broadcast-session.entity';
import { StreamService } from '../src/domains/stream/application/services/stream.service';
import { SubtitleListingService } from '../src/domains/subtitle/application/services/subtitle-listing.service';
import { SubtitleFileStreamService } from '../src/domains/subtitle/application/services/subtitle-file-stream.service';

function cloneSession(session: BroadcastSession): BroadcastSession {
  return {
    ...session,
  };
}

export async function enableBroadcast(
  app: INestApplication<App>,
): Promise<string> {
  const enabledResponse = await request(app.getHttpServer())
    .put('/api/broadcast/enabled')
    .send({ enabled: true })
    .expect(200);

  const enabledBody = enabledResponse.body as BroadcastOwnerSessionStatus;
  const shareToken = enabledBody.shareToken;
  if (!shareToken) {
    throw new Error('shareToken missing from enabled response');
  }

  return shareToken;
}

export async function configureSource(
  app: INestApplication<App>,
  streamMediaBySessionId: Map<string, string>,
  mediaId: string,
  hlsSessionId: string,
  subtitleFileName: string | null = 'broadcast_sub.vtt',
): Promise<void> {
  streamMediaBySessionId.set(hlsSessionId, mediaId);

  await request(app.getHttpServer())
    .put('/api/broadcast/source')
    .send({
      mediaId,
      hlsSessionId,
      subtitleFileName,
      selectedAudioStreamIndex: 0,
      maxVideoBitrateKbps: 5000,
      audioBitrateKbps: 128,
      maxOutputHeight: 1080,
    })
    .expect(200);
}

export async function pushPlayback(
  app: INestApplication<App>,
  positionSeconds: number,
  playbackIsPlaying: boolean,
  activePlayer: boolean,
): Promise<void> {
  await request(app.getHttpServer())
    .put('/api/broadcast/playback')
    .send({
      positionSeconds,
      playbackIsPlaying,
      activePlayer,
      syncTimestampMs: Date.now(),
    })
    .expect(200);
}

export function createBroadcastSessionStore(
  sessionsByOwner: Map<string, BroadcastSession>,
): BroadcastSessionStore {
  return {
    getByOwner: jest.fn((ownerAccountId: string) => {
      const session = sessionsByOwner.get(ownerAccountId);
      return session ? cloneSession(session) : undefined;
    }),
    getByShareToken: jest.fn((shareToken: string) => {
      for (const session of sessionsByOwner.values()) {
        if (session.shareToken === shareToken) {
          return cloneSession(session);
        }
      }

      return undefined;
    }),
    upsert: jest.fn((next: BroadcastSession) => {
      sessionsByOwner.set(next.ownerAccountId, cloneSession(next));
      return cloneSession(next);
    }),
  } as unknown as BroadcastSessionStore;
}

export function createStreamService(
  streamMediaBySessionId: Map<string, string>,
  streamFailureBySessionId: Map<string, Error>,
): StreamService {
  return {
    getHlsSessionStats: jest.fn((sessionId: string) => {
      const failure = streamFailureBySessionId.get(sessionId);
      if (failure) {
        throw failure;
      }

      const mediaId = streamMediaBySessionId.get(sessionId);
      if (!mediaId) {
        throw new NotFoundException('HLS session not found.');
      }

      return {
        mediaId,
        segmentSeconds: 6,
        totalSegments: 8,
        totalDurationSeconds: 48,
        readyThroughSeconds: 84,
        contiguousReadySegments: 14,
        highestReadySegment: 13,
        nextSegmentIndex: 14,
      };
    }),
    streamHlsFile: jest.fn(
      (
        sessionId: string,
        fileName: string,
        response: Response,
        _accessToken?: string,
        manifestTransform?: (manifest: string) => string,
      ) => {
        const manifest = buildTestManifest(sessionId, fileName);
        response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        response
          .status(200)
          .send(manifestTransform ? manifestTransform(manifest) : manifest);
      },
    ),
    streamHlsCompatibilitySegment: jest.fn(
      (_sessionId: string, _fileName: string, response: Response) => {
        response.setHeader('Content-Type', 'video/mp2t');
        response.status(200).send(Buffer.from('muxed transport stream'));
      },
    ),
  } as unknown as StreamService;
}

function buildTestManifest(sessionId: string, fileName: string): string {
  if (fileName === 'master.m3u8') {
    return [
      '#EXTM3U',
      `# ${sessionId}/${fileName}`,
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Primary",DEFAULT=YES,AUTOSELECT=YES,URI="audio.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="audio"',
      'video.m3u8',
      '',
    ].join('\n');
  }

  const segmentPrefix =
    fileName === 'video.m3u8' ? 'segment' : fileName.replace('.m3u8', '');

  return [
    '#EXTM3U',
    `# ${sessionId}/${fileName}`,
    '#EXT-X-TARGETDURATION:6',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    ...Array.from({ length: 8 }, (_, index) => [
      '#EXTINF:6.000,',
      `${segmentPrefix}_${String(index).padStart(5, '0')}.ts`,
    ]).flat(),
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');
}

export function createSubtitleListingService(): SubtitleListingService {
  return {
    list: jest.fn((mediaId: string) => {
      return {
        tracks: [
          {
            id: 'track-1',
            kind: 'external',
            label: 'English',
            language: 'en',
            format: 'vtt',
            extractable: true,
            url: `/api/subtitles/file/${mediaId}/broadcast_sub.vtt`,
          },
        ],
      };
    }),
  } as unknown as SubtitleListingService;
}

export function createSubtitleFileStreamService(): SubtitleFileStreamService {
  return {
    getSubtitleFile: jest.fn(() => {
      return Readable.from([
        'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello broadcast\n',
      ]);
    }),
  } as unknown as SubtitleFileStreamService;
}

export function createJwtAuthGuard(ownerUser: Record<string, unknown>) {
  return {
    canActivate: (context: {
      switchToHttp: () => { getRequest: () => Record<string, unknown> };
    }) => {
      const requestObject = context.switchToHttp().getRequest();
      requestObject.user = ownerUser;
      return true;
    },
  };
}

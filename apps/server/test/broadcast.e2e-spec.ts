import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastViewerHeartbeatResponse,
} from '@yeen/shared-contracts';
import { BroadcastController } from '../src/domains/broadcast/presentation/controllers/broadcast.controller';
import { BroadcastService } from '../src/domains/broadcast/application/services/broadcast.service';
import { BroadcastSessionStore } from '../src/domains/broadcast/infrastructure/stores/broadcast-session.store';
import { BroadcastSession } from '../src/domains/broadcast/domain/entities/broadcast-session.entity';
import { StreamService } from '../src/domains/stream/application/services/stream.service';
import { SubtitleListingService } from '../src/domains/subtitle/application/services/subtitle-listing.service';
import { SubtitleFileStreamService } from '../src/domains/subtitle/application/services/subtitle-file-stream.service';
import { JwtAuthGuard } from '../src/domains/auth/presentation/guards/jwt-auth.guard';

function cloneSession(session: BroadcastSession): BroadcastSession {
  return {
    ...session,
  };
}

describe('BroadcastController (integration e2e)', () => {
  let app: INestApplication<App>;

  let sessionsByOwner: Map<string, BroadcastSession>;
  let streamMediaBySessionId: Map<string, string>;
  let streamFailureBySessionId: Map<string, Error>;

  let broadcastSessionStore: BroadcastSessionStore;
  let streamService: StreamService;

  const ownerUser = {
    sub: 'owner-account-1',
    email: 'owner@example.test',
    name: 'Owner',
    role: 'user',
  } as const;

  async function enableBroadcast(): Promise<string> {
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

  async function configureSource(
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

  async function pushPlayback(
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

  beforeEach(async () => {
    sessionsByOwner = new Map<string, BroadcastSession>();
    streamMediaBySessionId = new Map<string, string>();
    streamFailureBySessionId = new Map<string, Error>();

    broadcastSessionStore = {
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

    streamService = {
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
          readyThroughSeconds: 84,
          contiguousReadySegments: 14,
          highestReadySegment: 13,
          nextSegmentIndex: 14,
        };
      }),
      streamHlsFile: jest.fn(
        (sessionId: string, fileName: string, response: Response) => {
          response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          response.status(200).send(`#EXTM3U\n# ${sessionId}/${fileName}`);
        },
      ),
    } as unknown as StreamService;

    const subtitleListingService = {
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

    const subtitleFileStreamService = {
      getSubtitleFile: jest.fn(() => {
        return Readable.from([
          'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello broadcast\n',
        ]);
      }),
    } as unknown as SubtitleFileStreamService;

    const jwtAuthGuard = {
      canActivate: (context: {
        switchToHttp: () => { getRequest: () => Record<string, unknown> };
      }) => {
        const requestObject = context.switchToHttp().getRequest();
        requestObject.user = ownerUser;
        return true;
      },
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [BroadcastController],
      providers: [
        BroadcastService,
        {
          provide: BroadcastSessionStore,
          useValue: broadcastSessionStore,
        },
        {
          provide: StreamService,
          useValue: streamService,
        },
        {
          provide: SubtitleListingService,
          useValue: subtitleListingService,
        },
        {
          provide: SubtitleFileStreamService,
          useValue: subtitleFileStreamService,
        },
      ],
    });

    const moduleFixture: TestingModule = await moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('supports owner and public broadcast flow end-to-end', async () => {
    const shareToken = await enableBroadcast();
    await configureSource('media-1', 'hls-session-1');
    await pushPlayback(126.5, true, true);

    const ownerSession = await request(app.getHttpServer())
      .get('/api/broadcast/session')
      .expect(200);
    const ownerBody = ownerSession.body as BroadcastOwnerSessionStatus;

    expect(ownerBody.enabled).toBe(true);
    expect(ownerBody.shareToken).toBe(shareToken);
    expect(ownerBody.mediaId).toBe('media-1');
    expect(ownerBody.hlsSessionId).toBe('hls-session-1');
    expect(ownerBody.playbackIsPlaying).toBe(true);

    const publicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const publicBody = publicStatus.body as BroadcastPublicSessionStatus;

    expect(publicBody.enabled).toBe(true);
    expect(publicBody.isLive).toBe(true);
    expect(publicBody.mediaId).toBe('media-1');
    expect(typeof publicBody.sourceEpoch).toBe('number');
    expect(publicBody.streamKey).toBe('media-1:hls-session-1');
    expect(publicBody.manifestUrl).toContain(
      `/api/broadcast/public/${encodeURIComponent(shareToken)}/hls/${publicBody.sourceEpoch}/master.m3u8`,
    );
    expect(publicBody.manifestUrl).toContain('stream=media-1%3Ahls-session-1');
    expect(typeof publicBody.serverNowMs).toBe('number');
    expect(typeof publicBody.playbackUpdatedAtMs).toBe('number');
    expect(publicBody.segmentTracking).not.toBeNull();
    expect(publicBody.segmentTracking?.segmentSeconds).toBe(6);
    expect(publicBody.serverNowMs).toBeGreaterThanOrEqual(
      publicBody.playbackUpdatedAtMs ?? 0,
    );

    const heartbeatFirst = await request(app.getHttpServer())
      .post(`/api/broadcast/public/${encodeURIComponent(shareToken)}/heartbeat`)
      .send({ viewerId: 'viewer-1' })
      .expect(201);

    const heartbeatSecond = await request(app.getHttpServer())
      .post(`/api/broadcast/public/${encodeURIComponent(shareToken)}/heartbeat`)
      .send({ viewerId: 'viewer-1' })
      .expect(201);
    const firstHeartbeatBody =
      heartbeatFirst.body as BroadcastViewerHeartbeatResponse;
    const secondHeartbeatBody =
      heartbeatSecond.body as BroadcastViewerHeartbeatResponse;

    expect(firstHeartbeatBody.viewerCount).toBe(1);
    expect(secondHeartbeatBody.viewerCount).toBe(1);

    const subtitles = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}/subtitles`)
      .expect(200);
    const subtitlesBody = subtitles.body as {
      tracks: Array<{ url: string | null }>;
    };

    expect(subtitlesBody.tracks).toHaveLength(1);
    expect(subtitlesBody.tracks[0].url).toBe(
      `/api/broadcast/public/${encodeURIComponent(shareToken)}/subtitles/broadcast_sub.vtt`,
    );

    await request(app.getHttpServer())
      .get(
        `/api/broadcast/public/${encodeURIComponent(shareToken)}/subtitles/broadcast_sub.vtt`,
      )
      .expect(200)
      .expect('Content-Type', /text\/vtt/);

    await request(app.getHttpServer())
      .get(
        `/api/broadcast/public/${encodeURIComponent(shareToken)}/hls/${publicBody.sourceEpoch}/master.m3u8`,
      )
      .expect(200)
      .expect('Content-Type', /application\/vnd.apple.mpegurl/);
  });

  it('maps upstream stream outages to bad gateway for public HLS', async () => {
    const shareToken = await enableBroadcast();
    await configureSource('media-2', 'hls-session-2');
    await pushPlayback(30, true, true);

    streamFailureBySessionId.set('hls-session-2', new Error('upstream down'));

    const publicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const publicBody = publicStatus.body as BroadcastPublicSessionStatus;

    await request(app.getHttpServer())
      .get(
        `/api/broadcast/public/${encodeURIComponent(shareToken)}/hls/${publicBody.sourceEpoch}/master.m3u8`,
      )
      .expect(502);
  });

  it('maps missing upstream stream sessions to not found for public HLS', async () => {
    const shareToken = await enableBroadcast();
    await configureSource('media-3', 'hls-session-3');
    await pushPlayback(45, true, true);

    streamFailureBySessionId.set(
      'hls-session-3',
      new NotFoundException('missing'),
    );

    const publicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const publicBody = publicStatus.body as BroadcastPublicSessionStatus;

    await request(app.getHttpServer())
      .get(
        `/api/broadcast/public/${encodeURIComponent(shareToken)}/hls/${publicBody.sourceEpoch}/master.m3u8`,
      )
      .expect(404);
  });

  it('handles owner media switch and disable-enable transitions', async () => {
    const shareToken = await enableBroadcast();

    await configureSource('media-a', 'hls-session-a');
    await pushPlayback(88, true, true);

    const initialPublicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const initialBody =
      initialPublicStatus.body as BroadcastPublicSessionStatus;

    await configureSource('media-b', 'hls-session-b');

    const switchedPublicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const switchedBody =
      switchedPublicStatus.body as BroadcastPublicSessionStatus;

    expect(switchedBody.mediaId).toBe('media-b');
    expect(switchedBody.streamKey).toBe('media-b:hls-session-b');
    expect(switchedBody.sourceEpoch).toBeGreaterThan(initialBody.sourceEpoch);
    expect(switchedBody.playbackPositionSeconds).toBe(0);
    expect(switchedBody.playbackIsPlaying).toBe(false);
    expect(switchedBody.manifestUrl).not.toBe(initialBody.manifestUrl);

    await request(app.getHttpServer())
      .get(
        `/api/broadcast/public/${encodeURIComponent(shareToken)}/hls/${initialBody.sourceEpoch}/master.m3u8`,
      )
      .expect(503)
      .expect('Retry-After', '2');

    await request(app.getHttpServer())
      .get(
        `/api/broadcast/public/${encodeURIComponent(shareToken)}/hls/${switchedBody.sourceEpoch}/master.m3u8`,
      )
      .expect(200);

    await request(app.getHttpServer())
      .put('/api/broadcast/enabled')
      .send({ enabled: false })
      .expect(200);

    const disabledStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const disabledBody = disabledStatus.body as BroadcastPublicSessionStatus;

    expect(disabledBody.enabled).toBe(false);
    expect(disabledBody.isLive).toBe(false);

    await request(app.getHttpServer())
      .put('/api/broadcast/enabled')
      .send({ enabled: true })
      .expect(200);

    const reenabledStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const reenabledBody = reenabledStatus.body as BroadcastPublicSessionStatus;

    expect(reenabledBody.enabled).toBe(true);
    expect(reenabledBody.isLive).toBe(false);
    expect(reenabledBody.mediaId).toBeNull();
    expect(reenabledBody.manifestUrl).toBeNull();
  });

  it('ignores stale playback updates that arrive after a source switch', async () => {
    const shareToken = await enableBroadcast();

    await configureSource('media-race-a', 'hls-session-race-a');

    await request(app.getHttpServer())
      .put('/api/broadcast/playback')
      .send({
        positionSeconds: 92,
        playbackIsPlaying: true,
        activePlayer: true,
        syncTimestampMs: 7000,
      })
      .expect(200);

    await configureSource('media-race-b', 'hls-session-race-b');

    const stalePlayback = await request(app.getHttpServer())
      .put('/api/broadcast/playback')
      .send({
        positionSeconds: 180,
        playbackIsPlaying: true,
        activePlayer: true,
        syncTimestampMs: 1,
      })
      .expect(200);
    const stalePlaybackBody = stalePlayback.body as BroadcastOwnerSessionStatus;

    expect(stalePlaybackBody.mediaId).toBe('media-race-b');
    expect(stalePlaybackBody.hlsSessionId).toBe('hls-session-race-b');
    expect(stalePlaybackBody.playbackPositionSeconds).toBe(0);
    expect(stalePlaybackBody.playbackIsPlaying).toBe(false);

    const publicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const publicStatusBody = publicStatus.body as BroadcastPublicSessionStatus;

    expect(publicStatusBody.mediaId).toBe('media-race-b');
    expect(publicStatusBody.playbackPositionSeconds).toBe(0);
    expect(publicStatusBody.playbackIsPlaying).toBe(false);
  });

  it('returns timing metadata after playback updates for latency compensation', async () => {
    const shareToken = await enableBroadcast();
    await configureSource('media-timing', 'hls-session-timing');
    await pushPlayback(33, true, true);

    const publicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const publicBody = publicStatus.body as BroadcastPublicSessionStatus;

    expect(publicBody.playbackUpdatedAt).not.toBeNull();
    expect(publicBody.playbackUpdatedAtMs).not.toBeNull();
    expect(typeof publicBody.serverNowMs).toBe('number');
    expect(typeof publicBody.sourceEpoch).toBe('number');
    expect(publicBody.serverNowMs).toBeGreaterThanOrEqual(
      publicBody.playbackUpdatedAtMs ?? 0,
    );
  });
});

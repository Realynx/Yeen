import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastViewerHeartbeatResponse,
} from '@yeen/shared-contracts';
import {
  configureSource,
  createBroadcastSessionStore,
  createJwtAuthGuard,
  createStreamService,
  createSubtitleFileStreamService,
  createSubtitleListingService,
  enableBroadcast,
  pushPlayback,
} from './broadcast.e2e.helpers';
import { BroadcastController } from '../src/domains/broadcast/presentation/controllers/broadcast.controller';
import { BroadcastService } from '../src/domains/broadcast/application/services/broadcast.service';
import { BroadcastSessionStore } from '../src/domains/broadcast/infrastructure/stores/broadcast-session.store';
import { BroadcastSession } from '../src/domains/broadcast/domain/entities/broadcast-session.entity';
import { StreamService } from '../src/domains/stream/application/services/stream.service';
import { SubtitleListingService } from '../src/domains/subtitle/application/services/subtitle-listing.service';
import { SubtitleFileStreamService } from '../src/domains/subtitle/application/services/subtitle-file-stream.service';
import { JwtAuthGuard } from '../src/domains/auth/presentation/guards/jwt-auth.guard';

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

  beforeEach(async () => {
    sessionsByOwner = new Map<string, BroadcastSession>();
    streamMediaBySessionId = new Map<string, string>();
    streamFailureBySessionId = new Map<string, Error>();

    broadcastSessionStore = createBroadcastSessionStore(sessionsByOwner);
    streamService = createStreamService(
      streamMediaBySessionId,
      streamFailureBySessionId,
    );

    const subtitleListingService = createSubtitleListingService();
    const subtitleFileStreamService = createSubtitleFileStreamService();
    const jwtAuthGuard = createJwtAuthGuard(ownerUser);

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
    const shareToken = await enableBroadcast(app);
    await configureSource(app, streamMediaBySessionId, 'media-1', 'hls-session-1');
    await pushPlayback(app, 126.5, true, true);

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
    const shareToken = await enableBroadcast(app);
    await configureSource(app, streamMediaBySessionId, 'media-2', 'hls-session-2');
    await pushPlayback(app, 30, true, true);

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
    const shareToken = await enableBroadcast(app);
    await configureSource(app, streamMediaBySessionId, 'media-3', 'hls-session-3');
    await pushPlayback(app, 45, true, true);

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
    const shareToken = await enableBroadcast(app);

    await configureSource(app, streamMediaBySessionId, 'media-a', 'hls-session-a');
    await pushPlayback(app, 88, true, true);

    const initialPublicStatus = await request(app.getHttpServer())
      .get(`/api/broadcast/public/${encodeURIComponent(shareToken)}`)
      .expect(200);
    const initialBody =
      initialPublicStatus.body as BroadcastPublicSessionStatus;

    await configureSource(app, streamMediaBySessionId, 'media-b', 'hls-session-b');

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
    const shareToken = await enableBroadcast(app);

    await configureSource(app, streamMediaBySessionId, 'media-race-a', 'hls-session-race-a');

    await request(app.getHttpServer())
      .put('/api/broadcast/playback')
      .send({
        positionSeconds: 92,
        playbackIsPlaying: true,
        activePlayer: true,
        syncTimestampMs: 7000,
      })
      .expect(200);

    await configureSource(app, streamMediaBySessionId, 'media-race-b', 'hls-session-race-b');

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
    const shareToken = await enableBroadcast(app);
    await configureSource(app, streamMediaBySessionId, 'media-timing', 'hls-session-timing');
    await pushPlayback(app, 33, true, true);

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

import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StreamService } from '../../../stream/application/services/stream.service';
import { BroadcastSession } from '../../domain/entities/broadcast-session.entity';
import { BroadcastSessionStore } from '../../infrastructure/stores/broadcast-session.store';
import {
  BroadcastService,
  BroadcastSourceEpochMismatchError,
} from './broadcast.service';
import { createBroadcastSession } from './broadcast-service.helpers';

function createSession(
  overrides: Partial<BroadcastSession> = {},
): BroadcastSession {
  const base = createBroadcastSession(
    'account-1',
    '2026-01-01T00:00:00.000Z',
    true,
  );

  return {
    ...base,
    shareToken: 'broadcasttoken1',
    mediaId: 'media-1',
    hlsSessionId: 'hls-1',
    playbackUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('BroadcastService', () => {
  let storedSession: BroadcastSession | undefined;
  let broadcastSessionStore: BroadcastSessionStore;
  let streamService: StreamService;
  let service: BroadcastService;
  let upsertMock: jest.Mock;
  let getHlsSessionStatsMock: jest.Mock;

  beforeEach(() => {
    storedSession = undefined;

    const getByOwnerMock = jest.fn((ownerAccountId: string) => {
      if (!storedSession || storedSession.ownerAccountId !== ownerAccountId) {
        return undefined;
      }

      return storedSession;
    });

    const getByShareTokenMock = jest.fn((shareToken: string) => {
      if (!storedSession || storedSession.shareToken !== shareToken) {
        return undefined;
      }

      return storedSession;
    });

    upsertMock = jest.fn((next: BroadcastSession) => {
      storedSession = next;
      return next;
    });

    broadcastSessionStore = {
      getByOwner: getByOwnerMock,
      getByShareToken: getByShareTokenMock,
      upsert: upsertMock,
    } as unknown as BroadcastSessionStore;

    getHlsSessionStatsMock = jest.fn();
    streamService = {
      getHlsSessionStats: getHlsSessionStatsMock,
    } as unknown as StreamService;

    service = new BroadcastService(broadcastSessionStore, streamService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not mutate an existing disabled session when source validation fails', async () => {
    storedSession = createSession({
      enabled: false,
      mediaId: 'media-old',
      hlsSessionId: 'hls-old',
      subtitleFileName: 'old.vtt',
      playbackPositionSeconds: 95,
      playbackIsPlaying: true,
      playbackUpdatedAt: '2026-01-01T01:00:00.000Z',
      playbackSyncTimestampMs: 2000,
      activePlayer: true,
      updatedAt: '2026-01-01T01:00:00.000Z',
    });

    const before = JSON.parse(
      JSON.stringify(storedSession),
    ) as BroadcastSession;
    getHlsSessionStatsMock.mockRejectedValueOnce(
      new Error('stream unavailable'),
    );

    await expect(
      service.updateSource('account-1', {
        mediaId: 'media-new',
        hlsSessionId: 'hls-new',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(storedSession).toEqual(before);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('resets playback state when source switches to a new media/session', async () => {
    storedSession = createSession({
      mediaId: 'media-old',
      hlsSessionId: 'hls-old',
      subtitleFileName: 'old.vtt',
      playbackPositionSeconds: 240,
      playbackIsPlaying: true,
      playbackUpdatedAt: '2026-01-01T02:00:00.000Z',
      playbackSyncTimestampMs: 1000,
      updatedAt: '2026-01-01T02:00:00.000Z',
      activePlayer: true,
    });

    getHlsSessionStatsMock.mockResolvedValueOnce({
      mediaId: 'media-new',
    });

    const initialSourceEpoch = storedSession.sourceEpoch;

    const updated = await service.updateSource('account-1', {
      mediaId: 'media-new',
      hlsSessionId: 'hls-new',
    });

    expect(updated.playbackPositionSeconds).toBe(0);
    expect(updated.playbackIsPlaying).toBe(false);
    expect(storedSession?.playbackPositionSeconds).toBe(0);
    expect(storedSession?.playbackIsPlaying).toBe(false);
    expect(storedSession?.playbackUpdatedAt).not.toBe(
      '2026-01-01T02:00:00.000Z',
    );
    expect(storedSession?.playbackSyncTimestampMs).toBeGreaterThan(1000);
    expect(storedSession?.sourceEpoch).toBe(initialSourceEpoch + 1);
  });

  it('clears playback state when source is removed', async () => {
    storedSession = createSession({
      mediaId: 'media-old',
      hlsSessionId: 'hls-old',
      playbackPositionSeconds: 180,
      playbackIsPlaying: true,
      playbackSyncTimestampMs: 3000,
    });

    const updated = await service.updateSource('account-1', {
      mediaId: null,
      hlsSessionId: null,
    });

    expect(updated.mediaId).toBeNull();
    expect(updated.hlsSessionId).toBeNull();
    expect(updated.playbackPositionSeconds).toBe(0);
    expect(updated.playbackIsPlaying).toBe(false);
    expect(storedSession?.playbackPositionSeconds).toBe(0);
    expect(storedSession?.playbackIsPlaying).toBe(false);
    expect(storedSession?.playbackSyncTimestampMs).toBeGreaterThan(3000);
  });

  it('ignores stale playback sync updates that arrive late', async () => {
    storedSession = createSession({
      playbackPositionSeconds: 120,
      playbackSyncTimestampMs: 2000,
      playbackIsPlaying: true,
    });

    const stale = await service.updatePlayback('account-1', {
      positionSeconds: 40,
      playbackIsPlaying: true,
      syncTimestampMs: 1000,
    });

    expect(stale.playbackPositionSeconds).toBe(120);
    expect(storedSession?.playbackPositionSeconds).toBe(120);
    expect(storedSession?.playbackSyncTimestampMs).toBe(2000);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('surfaces stream service outages as bad gateway for public HLS resolution', async () => {
    storedSession = createSession({
      enabled: true,
      activePlayer: true,
      playbackUpdatedAt: new Date().toISOString(),
    });

    getHlsSessionStatsMock.mockRejectedValueOnce(
      new Error('stream backend down'),
    );

    await expect(
      service.resolvePublicHlsSessionId(storedSession.shareToken),
    ).rejects.toThrow(BadGatewayException);
  });

  it('maps missing public stream sessions to not found', async () => {
    storedSession = createSession({
      enabled: true,
      activePlayer: true,
      playbackUpdatedAt: new Date().toISOString(),
    });

    getHlsSessionStatsMock.mockRejectedValueOnce(
      new NotFoundException('missing'),
    );

    await expect(
      service.resolvePublicHlsSessionId(storedSession.shareToken),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws retryable source-epoch mismatch error for stale HLS requests', async () => {
    storedSession = createSession({
      enabled: true,
      activePlayer: true,
      sourceEpoch: 5,
      playbackUpdatedAt: new Date().toISOString(),
    });

    await expect(
      service.resolvePublicHlsSessionId(storedSession.shareToken, '4'),
    ).rejects.toThrow(BroadcastSourceEpochMismatchError);
    expect(getHlsSessionStatsMock).not.toHaveBeenCalled();
  });

  it('does not refresh playbackUpdatedAt for unchanged inactive updates', async () => {
    storedSession = createSession({
      activePlayer: false,
      playbackIsPlaying: false,
      playbackPositionSeconds: 44,
      playbackUpdatedAt: '2026-01-01T05:00:00.000Z',
      playbackSyncTimestampMs: 4000,
    });

    const previousPlaybackUpdatedAt = storedSession.playbackUpdatedAt;

    const updated = await service.updatePlayback('account-1', {
      positionSeconds: 44,
      playbackIsPlaying: false,
      activePlayer: false,
      syncTimestampMs: 5000,
    });

    expect(updated.playbackUpdatedAt).toBe(previousPlaybackUpdatedAt);
    expect(storedSession?.playbackUpdatedAt).toBe(previousPlaybackUpdatedAt);
    expect(storedSession?.playbackSyncTimestampMs).toBe(5000);
  });

  it('caps excessively future client sync timestamps before storing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);

    storedSession = createSession({
      playbackPositionSeconds: 12,
      playbackSyncTimestampMs: 3000,
      playbackIsPlaying: true,
      activePlayer: true,
    });

    await service.updatePlayback('account-1', {
      positionSeconds: 16,
      playbackIsPlaying: true,
      activePlayer: true,
      syncTimestampMs: 999_999_999,
    });

    expect(storedSession?.playbackSyncTimestampMs).toBe(40_000);
  });

  it('exposes server and playback timing fields in public status', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(25_000);

    storedSession = createSession({
      enabled: true,
      mediaId: 'media-1',
      hlsSessionId: 'hls-1',
      sourceEpoch: 4,
      playbackPositionSeconds: 90,
      playbackIsPlaying: true,
      playbackUpdatedAt: new Date(24_000).toISOString(),
      playbackSyncTimestampMs: 24_000,
    });

    const publicStatus = await service.getPublicStatus(
      storedSession.shareToken,
    );

    expect(publicStatus.serverNowMs).toBe(25_000);
    expect(publicStatus.playbackUpdatedAtMs).toBe(24_000);
    expect(publicStatus.sourceEpoch).toBe(4);
    expect(publicStatus.streamKey).toBe('media-1:hls-1');
    expect(publicStatus.manifestUrl).toContain('/hls/4/master.m3u8');
    expect(publicStatus.manifestUrl).toContain('stream=media-1%3Ahls-1');
    expect(publicStatus.isLive).toBe(true);
  });

  it('keeps live status through brief playing heartbeat gaps', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(50_000);

    storedSession = createSession({
      enabled: true,
      mediaId: 'media-1',
      hlsSessionId: 'hls-1',
      activePlayer: true,
      playbackIsPlaying: true,
      playbackUpdatedAt: new Date(35_000).toISOString(),
      playbackSyncTimestampMs: 35_000,
    });

    const publicStatus = await service.getPublicStatus(
      storedSession.shareToken,
    );

    expect(publicStatus.isLive).toBe(true);
    expect(publicStatus.manifestUrl).not.toBeNull();
  });

  it('uses the baseline live grace when playback is not actively playing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(50_000);

    storedSession = createSession({
      enabled: true,
      mediaId: 'media-1',
      hlsSessionId: 'hls-1',
      activePlayer: true,
      playbackIsPlaying: false,
      playbackUpdatedAt: new Date(35_000).toISOString(),
      playbackSyncTimestampMs: 35_000,
    });

    const publicStatus = await service.getPublicStatus(
      storedSession.shareToken,
    );

    expect(publicStatus.isLive).toBe(false);
    expect(publicStatus.manifestUrl).toBeNull();
  });

  it('includes segment tracking metrics in public status when stream stats are available', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(25_000);

    storedSession = createSession({
      enabled: true,
      mediaId: 'media-1',
      hlsSessionId: 'hls-1',
      playbackPositionSeconds: 90,
      playbackIsPlaying: true,
      playbackUpdatedAt: new Date(24_000).toISOString(),
      playbackSyncTimestampMs: 24_000,
    });

    getHlsSessionStatsMock.mockResolvedValueOnce({
      mediaId: 'media-1',
      segmentSeconds: 6,
      readyThroughSeconds: 95,
      contiguousReadySegments: 16,
      highestReadySegment: 15,
      nextSegmentIndex: 16,
    });

    const publicStatus = await service.getPublicStatus(
      storedSession.shareToken,
    );

    expect(publicStatus.segmentTracking).toEqual({
      segmentSeconds: 6,
      playbackSegmentIndex: 15,
      readySegmentIndex: 15,
      readyThroughSeconds: 95,
      contiguousReadySegments: 16,
      highestReadySegment: 15,
      nextSegmentIndex: 16,
    });
  });
});

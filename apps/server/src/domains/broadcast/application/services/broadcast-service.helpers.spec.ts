import {
  createBroadcastSession,
  isBroadcastSessionLiveAt,
  toPublicStatus,
} from './broadcast-service.helpers';

describe('broadcast-service.helpers', () => {
  it('does not treat stale active-player sessions as live forever', () => {
    const nowMs = Date.now();
    const session = createBroadcastSession(
      'account-1',
      new Date(nowMs - 30_000).toISOString(),
      true,
    );

    session.mediaId = 'media-1';
    session.hlsSessionId = 'hls-1';
    session.activePlayer = true;
    session.playbackUpdatedAt = new Date(nowMs - 30_000).toISOString();
    session.playbackSyncTimestampMs = nowMs - 30_000;

    expect(isBroadcastSessionLiveAt(session, nowMs, 10_000)).toBe(false);
  });

  it('treats recent playback updates as live when source is present', () => {
    const nowMs = Date.now();
    const session = createBroadcastSession(
      'account-1',
      new Date(nowMs - 2_000).toISOString(),
      true,
    );

    session.mediaId = 'media-1';
    session.hlsSessionId = 'hls-1';
    session.activePlayer = false;
    session.playbackUpdatedAt = new Date(nowMs - 2_000).toISOString();
    session.playbackSyncTimestampMs = nowMs - 2_000;

    expect(isBroadcastSessionLiveAt(session, nowMs, 10_000)).toBe(true);
  });

  it('uses grace-window boundary consistently for liveness', () => {
    const playbackUpdatedAtMs = Date.now() - 10_000;
    const session = createBroadcastSession(
      'account-1',
      new Date(playbackUpdatedAtMs).toISOString(),
      true,
    );

    session.mediaId = 'media-1';
    session.hlsSessionId = 'hls-1';
    session.playbackUpdatedAt = new Date(playbackUpdatedAtMs).toISOString();
    session.playbackSyncTimestampMs = playbackUpdatedAtMs;

    expect(
      isBroadcastSessionLiveAt(session, playbackUpdatedAtMs + 10_000, 10_000),
    ).toBe(true);
    expect(
      isBroadcastSessionLiveAt(session, playbackUpdatedAtMs + 10_001, 10_000),
    ).toBe(false);
  });

  it('uses playback sync timestamp as a fallback freshness marker', () => {
    const nowMs = Date.now();
    const session = createBroadcastSession(
      'account-1',
      new Date(nowMs - 30_000).toISOString(),
      true,
    );

    session.mediaId = 'media-1';
    session.hlsSessionId = 'hls-1';
    session.playbackUpdatedAt = new Date(nowMs - 30_000).toISOString();
    session.playbackSyncTimestampMs = nowMs - 1_500;

    expect(isBroadcastSessionLiveAt(session, nowMs, 10_000)).toBe(true);
  });

  it('ignores playback sync timestamps that are unrealistically far in the future', () => {
    const nowMs = Date.now();
    const session = createBroadcastSession(
      'account-1',
      new Date(nowMs - 30_000).toISOString(),
      true,
    );

    session.mediaId = 'media-1';
    session.hlsSessionId = 'hls-1';
    session.playbackUpdatedAt = new Date(nowMs - 30_000).toISOString();
    session.playbackSyncTimestampMs = nowMs + 30_000;

    expect(isBroadcastSessionLiveAt(session, nowMs, 10_000)).toBe(false);
  });

  it('includes numeric playback timing metadata in public status payloads', () => {
    const nowMs = Date.now();
    const playbackUpdatedAtMs = nowMs - 1200;
    const session = createBroadcastSession(
      'account-1',
      new Date(nowMs).toISOString(),
      true,
    );

    session.mediaId = 'media-1';
    session.hlsSessionId = 'hls-1';
    session.sourceEpoch = 7;
    session.subtitleFileName = 'ep-01.vtt';
    session.subtitleFontPreset = 'mono';
    session.playbackIsPlaying = true;
    session.playbackPositionSeconds = 52;
    session.playbackUpdatedAt = new Date(playbackUpdatedAtMs).toISOString();

    const segmentTracking = {
      segmentSeconds: 6,
      playbackSegmentIndex: 8,
      readySegmentIndex: 8,
      readyThroughSeconds: 53,
      contiguousReadySegments: 9,
      highestReadySegment: 8,
      nextSegmentIndex: 9,
    };

    const status = toPublicStatus(session, 2, true, nowMs, segmentTracking);

    expect(status.serverNowMs).toBe(nowMs);
    expect(status.playbackUpdatedAtMs).toBe(playbackUpdatedAtMs);
    expect(status.playbackUpdatedAt).toBe(
      new Date(playbackUpdatedAtMs).toISOString(),
    );
    expect(status.sourceEpoch).toBe(7);
    expect(status.streamKey).toBe('media-1:hls-1');
    expect(status.manifestUrl).toContain('/hls/7/master.m3u8');
    expect(status.manifestUrl).toContain('stream=media-1%3Ahls-1');
    expect(status.subtitleUrl).toContain('sourceEpoch=7');
    expect(status.subtitleUrl).toContain('stream=media-1%3Ahls-1');
    expect(status.subtitleFontPreset).toBe('mono');
    expect(status.segmentTracking).toEqual(segmentTracking);
  });
});

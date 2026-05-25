import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StreamService } from '../../../stream/application/services/stream.service';
import {
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastStreamSegmentTrackingStatus,
  BroadcastSession,
  BroadcastViewerHeartbeatResponse,
} from '../../domain/entities/broadcast-session.entity';
import { UpdateBroadcastSourceDto } from '../dto/update-broadcast-source.dto';
import { UpdateBroadcastPlaybackDto } from '../dto/update-broadcast-playback.dto';
import { BroadcastSessionStore } from '../../infrastructure/stores/broadcast-session.store';
import {
  clearBroadcastSource,
  createBroadcastSession,
  emptyOwnerStatus,
  isBroadcastSessionLiveAt,
  normalizeAccountId,
  normalizeOptionalId,
  normalizeOptionalInteger,
  normalizeOptionalSubtitleFileName,
  normalizeOptionalSubtitleFontPreset,
  normalizeSeconds,
  normalizeShareToken,
  nextBroadcastSourceEpoch,
  resetBroadcastSourceAndPlayback,
  resolveViewerId,
  toOwnerStatus,
  toPublicStatus,
} from './broadcast-service.helpers';
import type { HlsSessionStatsResponse } from '../../../stream/application/services/stream.types';

export class BroadcastSourceEpochMismatchError extends Error {
  constructor() {
    super('Broadcast source epoch has changed.');
    this.name = 'BroadcastSourceEpochMismatchError';
  }
}

@Injectable()
export class BroadcastService {
  private static readonly VIEWER_STALE_MS = 45_000;
  private static readonly LIVE_STATE_GRACE_MS = 10_000;
  private static readonly LIVE_STATE_PLAYING_GRACE_MS = 20_000;
  private static readonly MAX_CLIENT_SYNC_FUTURE_DRIFT_MS = 30_000;

  private readonly viewerHeartbeats = new Map<string, Map<string, number>>();

  constructor(
    private readonly broadcastSessionStore: BroadcastSessionStore,
    private readonly streamService: StreamService,
  ) {}

  async getOwnerStatus(
    ownerAccountIdInput: string,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    const session = await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!session) {
      return emptyOwnerStatus();
    }

    return this.toOwnerStatus(session);
  }

  async setEnabled(
    ownerAccountIdInput: string,
    enabled: boolean,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    const existingSession =
      await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!existingSession && !enabled) {
      return emptyOwnerStatus();
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const session = existingSession
      ? { ...existingSession }
      : createBroadcastSession(ownerAccountId, nowIso, false);

    const stateChanged = session.enabled !== enabled;

    session.enabled = enabled;
    session.updatedAt = nowIso;

    if (stateChanged) {
      resetBroadcastSourceAndPlayback(session, nowIso, nowMs);

      if (!enabled) {
        this.viewerHeartbeats.delete(session.shareToken);
      }
    }

    await this.broadcastSessionStore.upsert(session);
    return this.toOwnerStatus(session);
  }

  async updateSource(
    ownerAccountIdInput: string,
    dto: UpdateBroadcastSourceDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const session = await this.getOrCreateEnabledSession(ownerAccountIdInput);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const mediaId = normalizeOptionalId(dto.mediaId);
    const hlsSessionId = normalizeOptionalId(dto.hlsSessionId);

    if (!mediaId || !hlsSessionId) {
      clearBroadcastSource(session, nowIso);
      await this.broadcastSessionStore.upsert(session);
      return this.toOwnerStatus(session);
    }

    await this.assertStreamSessionMatchesMedia(hlsSessionId, mediaId);

    const sourceChanged =
      session.mediaId !== mediaId || session.hlsSessionId !== hlsSessionId;

    session.mediaId = mediaId;
    session.hlsSessionId = hlsSessionId;
    session.subtitleFileName = normalizeOptionalSubtitleFileName(
      dto.subtitleFileName,
    );
    session.subtitleFontPreset = normalizeOptionalSubtitleFontPreset(
      dto.subtitleFontPreset,
    );
    session.activePlayer = true;
    session.selectedAudioStreamIndex = normalizeOptionalInteger(
      dto.selectedAudioStreamIndex,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    session.maxVideoBitrateKbps = normalizeOptionalInteger(
      dto.maxVideoBitrateKbps,
      250,
      50000,
    );
    session.audioBitrateKbps = normalizeOptionalInteger(
      dto.audioBitrateKbps,
      48,
      384,
    );
    session.maxOutputHeight = normalizeOptionalInteger(
      dto.maxOutputHeight,
      240,
      2160,
    );

    if (sourceChanged) {
      session.sourceEpoch = nextBroadcastSourceEpoch(session.sourceEpoch);
      session.playbackPositionSeconds = 0;
      session.playbackIsPlaying = false;
      session.playbackUpdatedAt = nowIso;
      session.playbackSyncTimestampMs = nowMs;
    }

    session.updatedAt = nowIso;

    await this.broadcastSessionStore.upsert(session);
    return this.toOwnerStatus(session);
  }

  async updatePlayback(
    ownerAccountIdInput: string,
    dto: UpdateBroadcastPlaybackDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    const session = await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!session) {
      return emptyOwnerStatus();
    }

    if (!session.enabled) {
      return this.toOwnerStatus(session);
    }

    const nowMs = Date.now();

    const nextSyncTimestampMsInput = normalizeOptionalInteger(
      dto.syncTimestampMs,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    const nextSyncTimestampMs =
      nextSyncTimestampMsInput === null
        ? null
        : Math.min(
            nextSyncTimestampMsInput,
            nowMs + BroadcastService.MAX_CLIENT_SYNC_FUTURE_DRIFT_MS,
          );

    const storedSyncTimestampMs =
      session.playbackSyncTimestampMs === null
        ? null
        : Math.min(
            session.playbackSyncTimestampMs,
            nowMs + BroadcastService.MAX_CLIENT_SYNC_FUTURE_DRIFT_MS,
          );

    if (
      nextSyncTimestampMs !== null &&
      storedSyncTimestampMs !== null &&
      nextSyncTimestampMs < storedSyncTimestampMs
    ) {
      return this.toOwnerStatus(session);
    }

    const nowIso = new Date(nowMs).toISOString();

    const nextPlaybackPositionSeconds = normalizeSeconds(dto.positionSeconds);
    const nextActivePlayer =
      typeof dto.activePlayer === 'boolean'
        ? dto.activePlayer
        : session.activePlayer;
    const nextPlaybackIsPlaying =
      Boolean(dto.playbackIsPlaying) &&
      nextActivePlayer &&
      Boolean(session.mediaId) &&
      Boolean(session.hlsSessionId);

    const playbackStateChanged =
      nextActivePlayer !== session.activePlayer ||
      nextPlaybackIsPlaying !== session.playbackIsPlaying ||
      Math.abs(nextPlaybackPositionSeconds - session.playbackPositionSeconds) >
        0.1;

    const shouldRefreshPlaybackUpdatedAt =
      nextActivePlayer || playbackStateChanged;

    session.playbackPositionSeconds = nextPlaybackPositionSeconds;
    session.activePlayer = nextActivePlayer;
    session.playbackIsPlaying = nextPlaybackIsPlaying;

    if (shouldRefreshPlaybackUpdatedAt) {
      session.playbackUpdatedAt = nowIso;
    }

    session.playbackSyncTimestampMs = Math.max(
      storedSyncTimestampMs ?? 0,
      nextSyncTimestampMs ?? nowMs,
    );
    session.updatedAt = nowIso;

    await this.broadcastSessionStore.upsert(session);
    return this.toOwnerStatus(session);
  }

  async getPublicStatus(
    shareTokenInput: string,
  ): Promise<BroadcastPublicSessionStatus> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    if (!session) {
      throw new NotFoundException('Broadcast was not found.');
    }

    return this.toPublicStatus(session);
  }

  async registerViewerHeartbeat(
    shareTokenInput: string,
    viewerIdInput?: string | null,
  ): Promise<BroadcastViewerHeartbeatResponse> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    if (!session) {
      throw new NotFoundException('Broadcast was not found.');
    }

    const viewerId = resolveViewerId(viewerIdInput);

    if (!session.enabled) {
      this.viewerHeartbeats.delete(shareToken);
      return {
        viewerId,
        viewerCount: 0,
        enabled: false,
        isLive: false,
      };
    }

    const nowMs = Date.now();
    const heartbeatMap =
      this.viewerHeartbeats.get(shareToken) ?? new Map<string, number>();

    heartbeatMap.set(viewerId, nowMs);
    this.viewerHeartbeats.set(shareToken, heartbeatMap);

    const viewerCount = this.cleanupAndCountViewers(shareToken, nowMs);

    return {
      viewerId,
      viewerCount,
      enabled: true,
      isLive: this.isSessionLive(session),
    };
  }

  async resolvePublicHlsSessionId(
    shareTokenInput: string,
    sourceEpochInput?: string,
  ): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const expectedSourceEpoch = this.parseExpectedSourceEpoch(sourceEpochInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    if (!session || !this.isSessionLive(session) || !session.hlsSessionId) {
      throw new NotFoundException('Broadcast stream is not active.');
    }

    if (
      expectedSourceEpoch !== null
      && session.sourceEpoch !== expectedSourceEpoch
    ) {
      throw new BroadcastSourceEpochMismatchError();
    }

    try {
      await this.streamService.getHlsSessionStats(session.hlsSessionId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Broadcast stream is unavailable.');
      }

      throw new BadGatewayException(
        'Broadcast stream is temporarily unavailable.',
      );
    }

    return session.hlsSessionId;
  }

  async resolvePublicMediaId(shareTokenInput: string): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    if (!session || !this.isSessionLive(session) || !session.mediaId) {
      throw new NotFoundException('Broadcast stream is not active.');
    }

    return session.mediaId;
  }

  private async getOrCreateEnabledSession(
    ownerAccountIdInput: string,
  ): Promise<BroadcastSession> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    const existing =
      await this.broadcastSessionStore.getByOwner(ownerAccountId);
    const nowIso = new Date().toISOString();

    if (existing) {
      const nextSession = { ...existing };

      if (!nextSession.enabled) {
        nextSession.enabled = true;
        nextSession.updatedAt = nowIso;
        resetBroadcastSourceAndPlayback(nextSession, nowIso, Date.now());
      }

      return nextSession;
    }

    return createBroadcastSession(ownerAccountId, nowIso, true);
  }

  private async assertStreamSessionMatchesMedia(
    hlsSessionId: string,
    mediaId: string,
  ): Promise<void> {
    try {
      const stats = await this.streamService.getHlsSessionStats(hlsSessionId);
      if (stats.mediaId !== mediaId) {
        throw new BadRequestException(
          'HLS session does not belong to the requested media item.',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('HLS session is not valid for broadcast.');
    }
  }

  private toOwnerStatus(
    session: BroadcastSession,
  ): BroadcastOwnerSessionStatus {
    const viewerCount = session.enabled
      ? this.cleanupAndCountViewers(session.shareToken)
      : 0;

    return toOwnerStatus(session, viewerCount);
  }

  private toPublicStatus(
    session: BroadcastSession,
  ): Promise<BroadcastPublicSessionStatus> {
    const nowMs = Date.now();
    const viewerCount = session.enabled
      ? this.cleanupAndCountViewers(session.shareToken, nowMs)
      : 0;
    const isLive = this.isSessionLiveAt(session, nowMs);
    return this.resolveSegmentTrackingStatus(session, isLive)
      .then((segmentTracking) => {
        return toPublicStatus(
          session,
          viewerCount,
          isLive,
          nowMs,
          segmentTracking,
        );
      });
  }

  private async resolveSegmentTrackingStatus(
    session: BroadcastSession,
    isLive: boolean,
  ): Promise<BroadcastStreamSegmentTrackingStatus | null> {
    if (!isLive || !session.hlsSessionId) {
      return null;
    }

    try {
      const stats = await this.streamService.getHlsSessionStats(
        session.hlsSessionId,
      );
      return this.toSegmentTrackingStatus(session, stats);
    } catch {
      // Status polling should remain resilient when stream metrics are transiently unavailable.
      return null;
    }
  }

  private toSegmentTrackingStatus(
    session: BroadcastSession,
    stats: HlsSessionStatsResponse,
  ): BroadcastStreamSegmentTrackingStatus | null {
    const segmentSeconds = this.normalizePositiveNumber(stats.segmentSeconds);
    const readyThroughSeconds = this.normalizeNonNegativeNumber(
      stats.readyThroughSeconds,
    );
    const contiguousReadySegments = this.normalizeNonNegativeInteger(
      stats.contiguousReadySegments,
    );
    const highestReadySegment = this.normalizeNonNegativeInteger(
      stats.highestReadySegment,
    );
    const nextSegmentIndex = this.normalizeNonNegativeInteger(
      stats.nextSegmentIndex,
    );

    if (
      segmentSeconds === null
      && readyThroughSeconds === null
      && contiguousReadySegments === null
      && highestReadySegment === null
      && nextSegmentIndex === null
    ) {
      return null;
    }

    const normalizedPlaybackPosition = Math.max(
      0,
      session.playbackPositionSeconds,
    );
    const playbackSegmentIndex =
      segmentSeconds === null
        ? null
        : Math.max(0, Math.floor(normalizedPlaybackPosition / segmentSeconds));
    const readySegmentIndex =
      contiguousReadySegments !== null
        ? contiguousReadySegments > 0
          ? contiguousReadySegments - 1
          : null
        : highestReadySegment;

    return {
      segmentSeconds,
      playbackSegmentIndex,
      readySegmentIndex,
      readyThroughSeconds,
      contiguousReadySegments,
      highestReadySegment,
      nextSegmentIndex,
    };
  }

  private normalizePositiveNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    return value;
  }

  private normalizeNonNegativeNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }

  private normalizeNonNegativeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.floor(value);
  }

  private isSessionLive(session: BroadcastSession): boolean {
    return this.isSessionLiveAt(session, Date.now());
  }

  private isSessionLiveAt(session: BroadcastSession, nowMs: number): boolean {
    const liveStateGraceMs =
      session.activePlayer && session.playbackIsPlaying
        ? BroadcastService.LIVE_STATE_PLAYING_GRACE_MS
        : BroadcastService.LIVE_STATE_GRACE_MS;

    return isBroadcastSessionLiveAt(
      session,
      nowMs,
      liveStateGraceMs,
    );
  }

  private parseExpectedSourceEpoch(value?: string): number | null {
    if (value === undefined) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      throw new BadRequestException('Invalid source epoch.');
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException('Invalid source epoch.');
    }

    return parsed;
  }

  private cleanupAndCountViewers(
    shareToken: string,
    nowMs: number = Date.now(),
  ): number {
    const heartbeatMap = this.viewerHeartbeats.get(shareToken);
    if (!heartbeatMap) {
      return 0;
    }

    for (const [viewerId, lastSeenMs] of heartbeatMap.entries()) {
      if (nowMs - lastSeenMs > BroadcastService.VIEWER_STALE_MS) {
        heartbeatMap.delete(viewerId);
      }
    }

    if (heartbeatMap.size === 0) {
      this.viewerHeartbeats.delete(shareToken);
      return 0;
    }

    return heartbeatMap.size;
  }
}

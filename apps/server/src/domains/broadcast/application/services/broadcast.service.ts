import { Injectable, NotFoundException } from '@nestjs/common';
import { StreamService } from '../../../stream/application/services/stream.service';
import {
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
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
} from './broadcast-service.helpers';
import {
  assertStreamSessionMatchesMedia,
  buildOwnerStatus,
  buildPublicStatus,
  cleanupAndCountViewers,
  getOrCreateEnabledSession,
  isSessionLiveAtWithGrace,
  resolvePublicHlsSessionId as resolvePublicHlsSessionIdHelper,
  resolvePublicMediaId as resolvePublicMediaIdHelper,
} from './broadcast-service.internal-helpers';
export { BroadcastSourceEpochMismatchError } from './broadcast-source-epoch-mismatch.error';

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

    return buildOwnerStatus(
      session,
      this.viewerHeartbeats,
      BroadcastService.VIEWER_STALE_MS,
    );
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
    return buildOwnerStatus(
      session,
      this.viewerHeartbeats,
      BroadcastService.VIEWER_STALE_MS,
    );
  }

  async updateSource(
    ownerAccountIdInput: string,
    dto: UpdateBroadcastSourceDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const session = await getOrCreateEnabledSession(
      this.broadcastSessionStore,
      ownerAccountIdInput,
    );
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const mediaId = normalizeOptionalId(dto.mediaId);
    const hlsSessionId = normalizeOptionalId(dto.hlsSessionId);

    if (!mediaId || !hlsSessionId) {
      clearBroadcastSource(session, nowIso);
      await this.broadcastSessionStore.upsert(session);
      return buildOwnerStatus(
        session,
        this.viewerHeartbeats,
        BroadcastService.VIEWER_STALE_MS,
      );
    }

    await assertStreamSessionMatchesMedia(this.streamService, hlsSessionId, mediaId);

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
    return buildOwnerStatus(
      session,
      this.viewerHeartbeats,
      BroadcastService.VIEWER_STALE_MS,
    );
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
      return buildOwnerStatus(
        session,
        this.viewerHeartbeats,
        BroadcastService.VIEWER_STALE_MS,
      );
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
      return buildOwnerStatus(
        session,
        this.viewerHeartbeats,
        BroadcastService.VIEWER_STALE_MS,
      );
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
    return buildOwnerStatus(
      session,
      this.viewerHeartbeats,
      BroadcastService.VIEWER_STALE_MS,
    );
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

    return buildPublicStatus(
      this.streamService,
      session,
      this.viewerHeartbeats,
      BroadcastService.VIEWER_STALE_MS,
      BroadcastService.LIVE_STATE_GRACE_MS,
      BroadcastService.LIVE_STATE_PLAYING_GRACE_MS,
    );
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

    const viewerCount = cleanupAndCountViewers(
      this.viewerHeartbeats,
      shareToken,
      BroadcastService.VIEWER_STALE_MS,
      nowMs,
    );

    return {
      viewerId,
      viewerCount,
      enabled: true,
      isLive: isSessionLiveAtWithGrace(
        session,
        nowMs,
        BroadcastService.LIVE_STATE_GRACE_MS,
        BroadcastService.LIVE_STATE_PLAYING_GRACE_MS,
      ),
    };
  }

  async resolvePublicHlsSessionId(
    shareTokenInput: string,
    sourceEpochInput?: string,
  ): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);
    const nowMs = Date.now();
    const activeSession =
      session
      && isSessionLiveAtWithGrace(
        session,
        nowMs,
        BroadcastService.LIVE_STATE_GRACE_MS,
        BroadcastService.LIVE_STATE_PLAYING_GRACE_MS,
      )
        ? session
        : null;

    return resolvePublicHlsSessionIdHelper(
      this.streamService,
      activeSession,
      sourceEpochInput,
    );
  }

  async resolvePublicMediaId(shareTokenInput: string): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    return resolvePublicMediaIdHelper(
      session,
      Date.now(),
      BroadcastService.LIVE_STATE_GRACE_MS,
      BroadcastService.LIVE_STATE_PLAYING_GRACE_MS,
    );
  }

}

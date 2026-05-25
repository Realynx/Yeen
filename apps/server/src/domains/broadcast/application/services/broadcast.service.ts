import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  isBroadcastSessionLiveAt,
  normalizeAccountId,
  normalizeOptionalId,
  normalizeOptionalInteger,
  normalizeOptionalSubtitleFileName,
  normalizeSeconds,
  normalizeShareToken,
  resetBroadcastSourceAndPlayback,
  resolveViewerId,
  toOwnerStatus,
  toPublicStatus,
} from './broadcast-service.helpers';

@Injectable()
export class BroadcastService {
  private static readonly VIEWER_STALE_MS = 45_000;
  private static readonly LIVE_STATE_GRACE_MS = 10_000;

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

    const mediaId = normalizeOptionalId(dto.mediaId);
    const hlsSessionId = normalizeOptionalId(dto.hlsSessionId);

    if (!mediaId || !hlsSessionId) {
      clearBroadcastSource(session, nowIso);
      await this.broadcastSessionStore.upsert(session);
      return this.toOwnerStatus(session);
    }

    await this.assertStreamSessionMatchesMedia(hlsSessionId, mediaId);

    session.mediaId = mediaId;
    session.hlsSessionId = hlsSessionId;
    session.subtitleFileName = normalizeOptionalSubtitleFileName(
      dto.subtitleFileName,
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

    const nextSyncTimestampMs = normalizeOptionalInteger(
      dto.syncTimestampMs,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    if (
      nextSyncTimestampMs !== null &&
      session.playbackSyncTimestampMs !== null &&
      nextSyncTimestampMs < session.playbackSyncTimestampMs
    ) {
      return this.toOwnerStatus(session);
    }

    const nowIso = new Date().toISOString();

    session.playbackPositionSeconds = normalizeSeconds(dto.positionSeconds);
    session.activePlayer =
      typeof dto.activePlayer === 'boolean'
        ? dto.activePlayer
        : session.activePlayer;
    session.playbackIsPlaying =
      Boolean(dto.playbackIsPlaying) &&
      session.activePlayer &&
      Boolean(session.mediaId) &&
      Boolean(session.hlsSessionId);
    session.playbackUpdatedAt = nowIso;
    session.playbackSyncTimestampMs =
      nextSyncTimestampMs ?? session.playbackSyncTimestampMs ?? Date.now();
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

  async resolvePublicHlsSessionId(shareTokenInput: string): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    if (!session || !this.isSessionLive(session) || !session.hlsSessionId) {
      throw new NotFoundException('Broadcast stream is not active.');
    }

    try {
      await this.streamService.getHlsSessionStats(session.hlsSessionId);
    } catch {
      throw new NotFoundException('Broadcast stream is unavailable.');
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
      if (!existing.enabled) {
        existing.enabled = true;
        existing.updatedAt = nowIso;
        resetBroadcastSourceAndPlayback(existing, nowIso, Date.now());
      }

      return existing;
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
  ): BroadcastPublicSessionStatus {
    const nowMs = Date.now();
    const viewerCount = session.enabled
      ? this.cleanupAndCountViewers(session.shareToken, nowMs)
      : 0;
    const isLive = this.isSessionLiveAt(session, nowMs);

    return toPublicStatus(session, viewerCount, isLive);
  }

  private isSessionLive(session: BroadcastSession): boolean {
    return this.isSessionLiveAt(session, Date.now());
  }

  private isSessionLiveAt(session: BroadcastSession, nowMs: number): boolean {
    return isBroadcastSessionLiveAt(
      session,
      nowMs,
      BroadcastService.LIVE_STATE_GRACE_MS,
    );
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

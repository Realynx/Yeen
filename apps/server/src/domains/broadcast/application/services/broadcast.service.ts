import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
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

@Injectable()
export class BroadcastService {
  private static readonly VIEWER_STALE_MS = 45_000;
  private static readonly VIEWER_ID_MAX_LENGTH = 128;
  private static readonly LIVE_STATE_GRACE_MS = 10_000;

  private readonly viewerHeartbeats = new Map<string, Map<string, number>>();

  constructor(
    private readonly broadcastSessionStore: BroadcastSessionStore,
    private readonly streamService: StreamService,
  ) {}

  async getOwnerStatus(
    ownerAccountIdInput: string,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = this.normalizeAccountId(ownerAccountIdInput);
    const session = await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!session) {
      return this.emptyOwnerStatus();
    }

    return this.toOwnerStatus(session);
  }

  async setEnabled(
    ownerAccountIdInput: string,
    enabled: boolean,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = this.normalizeAccountId(ownerAccountIdInput);
    const existingSession =
      await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!existingSession && !enabled) {
      return this.emptyOwnerStatus();
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const session = existingSession
      ? { ...existingSession }
      : this.createSession(ownerAccountId, nowIso, false);

    const stateChanged = session.enabled !== enabled;

    session.enabled = enabled;
    session.updatedAt = nowIso;

    if (stateChanged) {
      this.resetSessionSourceAndPlayback(session, nowIso, nowMs);

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

    const mediaId = this.normalizeOptionalId(dto.mediaId);
    const hlsSessionId = this.normalizeOptionalId(dto.hlsSessionId);

    if (!mediaId || !hlsSessionId) {
      this.clearSource(session, nowIso);
      await this.broadcastSessionStore.upsert(session);
      return this.toOwnerStatus(session);
    }

    await this.assertStreamSessionMatchesMedia(hlsSessionId, mediaId);

    session.mediaId = mediaId;
    session.hlsSessionId = hlsSessionId;
    session.subtitleFileName = this.normalizeOptionalSubtitleFileName(
      dto.subtitleFileName,
    );
    session.activePlayer = true;
    session.selectedAudioStreamIndex = this.normalizeOptionalInteger(
      dto.selectedAudioStreamIndex,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    session.maxVideoBitrateKbps = this.normalizeOptionalInteger(
      dto.maxVideoBitrateKbps,
      250,
      50000,
    );
    session.audioBitrateKbps = this.normalizeOptionalInteger(
      dto.audioBitrateKbps,
      48,
      384,
    );
    session.maxOutputHeight = this.normalizeOptionalInteger(
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
    const ownerAccountId = this.normalizeAccountId(ownerAccountIdInput);
    const session = await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!session) {
      return this.emptyOwnerStatus();
    }

    if (!session.enabled) {
      return this.toOwnerStatus(session);
    }

    const nextSyncTimestampMs = this.normalizeOptionalInteger(
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

    session.playbackPositionSeconds = this.normalizeSeconds(
      dto.positionSeconds,
    );
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
    const shareToken = this.normalizeShareToken(shareTokenInput);
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
    const shareToken = this.normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    if (!session) {
      throw new NotFoundException('Broadcast was not found.');
    }

    const viewerId = this.resolveViewerId(viewerIdInput);

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
    const shareToken = this.normalizeShareToken(shareTokenInput);
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
    const shareToken = this.normalizeShareToken(shareTokenInput);
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
    const ownerAccountId = this.normalizeAccountId(ownerAccountIdInput);
    const existing =
      await this.broadcastSessionStore.getByOwner(ownerAccountId);
    const nowIso = new Date().toISOString();

    if (existing) {
      if (!existing.enabled) {
        existing.enabled = true;
        existing.updatedAt = nowIso;
        this.resetSessionSourceAndPlayback(existing, nowIso, Date.now());
      }

      return existing;
    }

    return this.createSession(ownerAccountId, nowIso, true);
  }

  private createSession(
    ownerAccountId: string,
    nowIso: string,
    enabled: boolean,
  ): BroadcastSession {
    return {
      ownerAccountId,
      shareToken: this.createShareToken(),
      enabled,
      activePlayer: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      mediaId: null,
      hlsSessionId: null,
      subtitleFileName: null,
      playbackPositionSeconds: 0,
      playbackIsPlaying: false,
      playbackUpdatedAt: nowIso,
      playbackSyncTimestampMs: Date.now(),
      selectedAudioStreamIndex: null,
      maxVideoBitrateKbps: null,
      audioBitrateKbps: null,
      maxOutputHeight: null,
    };
  }

  private clearSource(session: BroadcastSession, nowIso: string): void {
    session.mediaId = null;
    session.hlsSessionId = null;
    session.subtitleFileName = null;
    session.activePlayer = false;
    session.selectedAudioStreamIndex = null;
    session.maxVideoBitrateKbps = null;
    session.audioBitrateKbps = null;
    session.maxOutputHeight = null;
    session.playbackIsPlaying = false;
    session.playbackUpdatedAt = nowIso;
    session.updatedAt = nowIso;
  }

  private resetSessionSourceAndPlayback(
    session: BroadcastSession,
    nowIso: string,
    nowMs: number,
  ): void {
    session.mediaId = null;
    session.hlsSessionId = null;
    session.subtitleFileName = null;
    session.activePlayer = false;
    session.selectedAudioStreamIndex = null;
    session.maxVideoBitrateKbps = null;
    session.audioBitrateKbps = null;
    session.maxOutputHeight = null;
    session.playbackPositionSeconds = 0;
    session.playbackIsPlaying = false;
    session.playbackUpdatedAt = nowIso;
    session.playbackSyncTimestampMs = nowMs;
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

    return {
      enabled: session.enabled,
      activePlayer: session.activePlayer,
      shareToken: session.shareToken,
      mediaId: session.mediaId,
      hlsSessionId: session.hlsSessionId,
      subtitleFileName: session.subtitleFileName,
      playbackPositionSeconds: session.playbackPositionSeconds,
      playbackIsPlaying: session.playbackIsPlaying,
      playbackUpdatedAt: session.playbackUpdatedAt,
      selectedAudioStreamIndex: session.selectedAudioStreamIndex,
      maxVideoBitrateKbps: session.maxVideoBitrateKbps,
      audioBitrateKbps: session.audioBitrateKbps,
      maxOutputHeight: session.maxOutputHeight,
      viewerCount,
      updatedAt: session.updatedAt,
    };
  }

  private toPublicStatus(
    session: BroadcastSession,
  ): BroadcastPublicSessionStatus {
    const nowMs = Date.now();
    const viewerCount = session.enabled
      ? this.cleanupAndCountViewers(session.shareToken, nowMs)
      : 0;
    const isLive = this.isSessionLiveAt(session, nowMs);

    return {
      enabled: session.enabled,
      isLive,
      activePlayer: session.activePlayer,
      shareToken: session.shareToken,
      mediaId: session.mediaId,
      manifestUrl: isLive
        ? `/api/broadcast/public/${encodeURIComponent(session.shareToken)}/hls/master.m3u8`
        : null,
      subtitleUrl:
        isLive && session.subtitleFileName
          ? `/api/broadcast/public/${encodeURIComponent(session.shareToken)}/subtitles/${encodeURIComponent(session.subtitleFileName)}`
          : null,
      playbackPositionSeconds: session.playbackPositionSeconds,
      playbackIsPlaying: session.playbackIsPlaying,
      playbackUpdatedAt: session.playbackUpdatedAt,
      viewerCount,
    };
  }

  private emptyOwnerStatus(): BroadcastOwnerSessionStatus {
    return {
      enabled: false,
      activePlayer: false,
      shareToken: null,
      mediaId: null,
      hlsSessionId: null,
      subtitleFileName: null,
      playbackPositionSeconds: 0,
      playbackIsPlaying: false,
      playbackUpdatedAt: null,
      selectedAudioStreamIndex: null,
      maxVideoBitrateKbps: null,
      audioBitrateKbps: null,
      maxOutputHeight: null,
      viewerCount: 0,
      updatedAt: null,
    };
  }

  private isSessionLive(session: BroadcastSession): boolean {
    return this.isSessionLiveAt(session, Date.now());
  }

  private isSessionLiveAt(session: BroadcastSession, nowMs: number): boolean {
    if (!session.enabled || !session.mediaId || !session.hlsSessionId) {
      return false;
    }

    if (session.activePlayer) {
      return true;
    }

    if (!session.playbackUpdatedAt) {
      return false;
    }

    const playbackUpdatedAtMs = Date.parse(session.playbackUpdatedAt);
    if (!Number.isFinite(playbackUpdatedAtMs)) {
      return false;
    }

    return (
      nowMs - playbackUpdatedAtMs <= BroadcastService.LIVE_STATE_GRACE_MS
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

  private resolveViewerId(viewerIdInput?: string | null): string {
    if (typeof viewerIdInput === 'string') {
      const trimmed = viewerIdInput.trim();
      if (trimmed) {
        return trimmed.slice(0, BroadcastService.VIEWER_ID_MAX_LENGTH);
      }
    }

    return randomBytes(10).toString('hex');
  }

  private createShareToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private normalizeAccountId(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Invalid account id.');
    }

    return trimmed;
  }

  private normalizeShareToken(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || !/^[A-Za-z0-9_-]{12,256}$/.test(trimmed)) {
      throw new NotFoundException('Broadcast was not found.');
    }

    return trimmed;
  }

  private normalizeOptionalId(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, 128);
  }

  private normalizeOptionalSubtitleFileName(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const nameOnly = basename(trimmed);
    if (!nameOnly || nameOnly === '.' || nameOnly === '..') {
      return null;
    }

    return nameOnly.slice(0, 260);
  }

  private normalizeSeconds(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.max(0, value);
  }

  private normalizeOptionalInteger(
    value: number | null | undefined,
    min: number,
    max: number,
  ): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.floor(value);
    if (normalized < min || normalized > max) {
      return null;
    }

    return normalized;
  }
}

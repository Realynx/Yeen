import {
  Injectable,
  NotFoundException,
  Optional,
  type MessageEvent,
} from '@nestjs/common';
import {
  Subject,
  defer,
  from,
  interval,
  merge,
  of,
  type Observable,
} from 'rxjs';
import { concatMap, filter, map } from 'rxjs/operators';
import { StreamService } from '../../../stream/application/services/stream.service';
import {
  BroadcastSession,
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastViewerHeartbeatResponse,
} from '../../domain/entities/broadcast-session.entity';
import type {
  BroadcastViewerClientType,
  BroadcastViewerIpLocation,
  BroadcastViewerStatus,
} from '@yeen/shared-contracts';
import { BroadcastIpLocationService } from './broadcast-ip-location.service';
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
  toPublicStatus,
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
import { BroadcastMutationQueue } from './broadcast-mutation-queue';
export { BroadcastSourceEpochMismatchError } from './broadcast-source-epoch-mismatch.error';

@Injectable()
export class BroadcastService {
  private static readonly VIEWER_STALE_MS = 45_000;
  private static readonly LIVE_STATE_GRACE_MS = 10_000;
  private static readonly LIVE_STATE_PLAYING_GRACE_MS = 20_000;
  private static readonly MAX_CLIENT_SYNC_FUTURE_DRIFT_MS = 30_000;
  private static readonly DIRECT_STREAM_SEEK_THRESHOLD_SECONDS = 1.25;

  private readonly viewerHeartbeats = new Map<string, Map<string, number>>();
  private readonly viewerTelemetry = new Map<
    string,
    Map<string, BroadcastViewerTelemetryRecord>
  >();
  private readonly mutationQueue = new BroadcastMutationQueue();
  private readonly publicStatusChanges = new Subject<string>();

  constructor(
    private readonly broadcastSessionStore: BroadcastSessionStore,
    private readonly streamService: StreamService,
    @Optional()
    private readonly ipLocationService?: BroadcastIpLocationService,
  ) {}

  async getOwnerStatus(
    ownerAccountIdInput: string,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    const session = await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!session) {
      return emptyOwnerStatus();
    }

    return this.buildOwnerStatus(session);
  }

  async setEnabled(
    ownerAccountIdInput: string,
    enabled: boolean,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    return this.mutationQueue.run(ownerAccountId, async () => {
      const status = await this.setEnabledLocked(ownerAccountId, enabled);
      this.notifyPublicStatus(status.shareToken);
      return status;
    });
  }

  private async setEnabledLocked(
    ownerAccountId: string,
    enabled: boolean,
  ): Promise<BroadcastOwnerSessionStatus> {
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
        this.viewerTelemetry.delete(session.shareToken);
      }
    }

    await this.broadcastSessionStore.upsert(session);
    return this.buildOwnerStatus(session);
  }

  async updateSource(
    ownerAccountIdInput: string,
    dto: UpdateBroadcastSourceDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    return this.mutationQueue.run(ownerAccountId, async () => {
      const status = await this.updateSourceLocked(ownerAccountId, dto);
      this.notifyPublicStatus(status.shareToken);
      return status;
    });
  }

  private async updateSourceLocked(
    ownerAccountId: string,
    dto: UpdateBroadcastSourceDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const session = await getOrCreateEnabledSession(
      this.broadcastSessionStore,
      ownerAccountId,
    );
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const mediaId = normalizeOptionalId(dto.mediaId);
    const hlsSessionId = normalizeOptionalId(dto.hlsSessionId);

    if (!mediaId || !hlsSessionId) {
      clearBroadcastSource(session, nowIso);
      await this.broadcastSessionStore.upsert(session);
      return this.buildOwnerStatus(session);
    }

    await assertStreamSessionMatchesMedia(
      this.streamService,
      hlsSessionId,
      mediaId,
    );

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
    return this.buildOwnerStatus(session);
  }

  async updatePlayback(
    ownerAccountIdInput: string,
    dto: UpdateBroadcastPlaybackDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
    return this.mutationQueue.run(ownerAccountId, async () => {
      const status = await this.updatePlaybackLocked(ownerAccountId, dto);
      this.notifyPublicStatus(status.shareToken);
      return status;
    });
  }

  private async updatePlaybackLocked(
    ownerAccountId: string,
    dto: UpdateBroadcastPlaybackDto,
  ): Promise<BroadcastOwnerSessionStatus> {
    const session = await this.broadcastSessionStore.getByOwner(ownerAccountId);

    if (!session) {
      return emptyOwnerStatus();
    }

    if (!session.enabled) {
      return this.buildOwnerStatus(session);
    }

    const nowMs = Date.now();

    const nextSyncTimestampMsInput = normalizeOptionalInteger(
      dto.syncTimestampMs,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    const nextSyncTimestampMs = this.clampSyncTimestamp(
      nextSyncTimestampMsInput,
      nowMs,
    );
    const storedSyncTimestampMs = this.clampSyncTimestamp(
      session.playbackSyncTimestampMs,
      nowMs,
    );

    if (
      nextSyncTimestampMs !== null &&
      storedSyncTimestampMs !== null &&
      nextSyncTimestampMs < storedSyncTimestampMs
    ) {
      return this.buildOwnerStatus(session);
    }

    const nowIso = new Date(nowMs).toISOString();

    const nextPlaybackPositionSeconds = normalizeSeconds(dto.positionSeconds);
    const nextActivePlayer = this.resolveActivePlayer(dto, session);
    const nextPlaybackIsPlaying = this.resolvePlaybackIsPlaying(
      dto,
      session,
      nextActivePlayer,
    );

    const playbackStateChanged =
      nextActivePlayer !== session.activePlayer ||
      nextPlaybackIsPlaying !== session.playbackIsPlaying ||
      Math.abs(nextPlaybackPositionSeconds - session.playbackPositionSeconds) >
        0.1;

    const shouldRefreshPlaybackUpdatedAt =
      nextActivePlayer || playbackStateChanged;

    if (
      this.shouldRestartDirectStream(
        session,
        nextPlaybackPositionSeconds,
        nextPlaybackIsPlaying,
        nextActivePlayer,
        nextSyncTimestampMs ?? nowMs,
        storedSyncTimestampMs,
      )
    ) {
      session.sourceEpoch = nextBroadcastSourceEpoch(session.sourceEpoch);
    }

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
    return this.buildOwnerStatus(session);
  }

  private clampSyncTimestamp(
    value: number | null,
    nowMs: number,
  ): number | null {
    if (value === null) return null;
    return Math.min(
      value,
      nowMs + BroadcastService.MAX_CLIENT_SYNC_FUTURE_DRIFT_MS,
    );
  }

  private resolveActivePlayer(
    dto: UpdateBroadcastPlaybackDto,
    session: BroadcastSession,
  ): boolean {
    return typeof dto.activePlayer === 'boolean'
      ? dto.activePlayer
      : session.activePlayer;
  }

  private resolvePlaybackIsPlaying(
    dto: UpdateBroadcastPlaybackDto,
    session: BroadcastSession,
    activePlayer: boolean,
  ): boolean {
    return Boolean(
      dto.playbackIsPlaying &&
      activePlayer &&
      session.mediaId &&
      session.hlsSessionId,
    );
  }

  private shouldRestartDirectStream(
    session: BroadcastSession,
    nextPositionSeconds: number,
    nextIsPlaying: boolean,
    nextActivePlayer: boolean,
    nextSyncTimestampMs: number,
    storedSyncTimestampMs: number | null,
  ): boolean {
    if (!session.mediaId || !session.hlsSessionId || !nextActivePlayer) {
      return false;
    }

    if (nextIsPlaying !== session.playbackIsPlaying) {
      return true;
    }

    const elapsedSeconds =
      session.activePlayer &&
      session.playbackIsPlaying &&
      storedSyncTimestampMs !== null
        ? Math.max(0, (nextSyncTimestampMs - storedSyncTimestampMs) / 1000)
        : 0;
    const expectedPositionSeconds =
      session.playbackPositionSeconds + elapsedSeconds;

    return (
      Math.abs(nextPositionSeconds - expectedPositionSeconds) >=
      BroadcastService.DIRECT_STREAM_SEEK_THRESHOLD_SECONDS
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

  observePublicStatus(shareTokenInput: string): Observable<MessageEvent> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const invalidations = this.publicStatusChanges.pipe(
      filter((changedToken) => changedToken === shareToken),
    );

    return merge(of(shareToken), invalidations, interval(15_000)).pipe(
      concatMap(() =>
        defer(() => from(this.getPublicTimelineStatus(shareToken))),
      ),
      map((status) => ({ data: status })),
    );
  }

  private async getPublicTimelineStatus(
    shareToken: string,
  ): Promise<BroadcastPublicSessionStatus> {
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);
    if (!session) {
      throw new NotFoundException('Broadcast was not found.');
    }

    const nowMs = Date.now();
    const viewerCount = session.enabled
      ? cleanupAndCountViewers(
          this.viewerHeartbeats,
          shareToken,
          BroadcastService.VIEWER_STALE_MS,
          nowMs,
        )
      : 0;
    const isLive = isSessionLiveAtWithGrace(
      session,
      nowMs,
      BroadcastService.LIVE_STATE_GRACE_MS,
      BroadcastService.LIVE_STATE_PLAYING_GRACE_MS,
    );
    return toPublicStatus(session, viewerCount, isLive, nowMs);
  }

  async registerViewerHeartbeat(
    shareTokenInput: string,
    viewerIdInput?: string | null,
    ipAddressInput?: string | null,
    userAgentInput?: string | null,
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
    this.registerViewerAccess(
      shareToken,
      'web',
      ipAddressInput,
      userAgentInput,
    );
    this.notifyPublicStatus(shareToken);

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

  registerViewerAccess(
    shareTokenInput: string,
    clientType: BroadcastViewerClientType,
    ipAddressInput?: string | null,
    userAgentInput?: string | null,
  ): void {
    this.recordViewerTelemetry(
      normalizeShareToken(shareTokenInput),
      clientType,
      ipAddressInput,
      userAgentInput,
      null,
    );
  }

  registerViewerDelivery(
    shareTokenInput: string,
    clientType: BroadcastViewerClientType,
    ipAddressInput: string | null | undefined,
    userAgentInput: string | null | undefined,
    bytes: number,
    durationMs: number,
  ): void {
    const speedBytesPerSecond =
      Number.isFinite(bytes) &&
      bytes > 0 &&
      Number.isFinite(durationMs) &&
      durationMs > 0
        ? (bytes * 1000) / durationMs
        : null;
    this.recordViewerTelemetry(
      normalizeShareToken(shareTokenInput),
      clientType,
      ipAddressInput,
      userAgentInput,
      speedBytesPerSecond,
    );
  }

  private recordViewerTelemetry(
    shareToken: string,
    clientType: BroadcastViewerClientType,
    ipAddressInput: string | null | undefined,
    userAgentInput: string | null | undefined,
    speedBytesPerSecond: number | null,
  ): void {
    const nowMs = Date.now();
    const ipAddress = normalizeViewerIpAddress(ipAddressInput);
    const userAgent = normalizeViewerUserAgent(userAgentInput);
    const viewerKey = `${clientType}:${ipAddress}`;
    const viewers =
      this.viewerTelemetry.get(shareToken) ??
      new Map<string, BroadcastViewerTelemetryRecord>();
    const existing = viewers.get(viewerKey);
    const isPrivateAddress =
      this.ipLocationService?.isPrivateAddress(ipAddress) ?? true;
    const smoothedSpeed =
      speedBytesPerSecond === null
        ? (existing?.networkSpeedBytesPerSecond ?? null)
        : existing?.networkSpeedBytesPerSecond
          ? existing.networkSpeedBytesPerSecond * 0.7 +
            speedBytesPerSecond * 0.3
          : speedBytesPerSecond;

    viewers.set(viewerKey, {
      ipAddress,
      clientType,
      userAgent,
      networkSpeedBytesPerSecond: smoothedSpeed,
      ipLocationStatus:
        existing?.ipLocationStatus ??
        (isPrivateAddress ? 'private' : 'pending'),
      ipLocation: existing?.ipLocation ?? null,
      lastSeenMs: nowMs,
    });
    this.viewerTelemetry.set(shareToken, viewers);
    this.cleanupViewerTelemetry(shareToken, nowMs);

    if (!existing && !isPrivateAddress && this.ipLocationService) {
      void this.enrichViewerLocation(shareToken, viewerKey, ipAddress);
    }
  }

  private async enrichViewerLocation(
    shareToken: string,
    viewerKey: string,
    ipAddress: string,
  ): Promise<void> {
    const location = await this.ipLocationService?.lookup(ipAddress);
    const viewer = this.viewerTelemetry.get(shareToken)?.get(viewerKey);
    if (!viewer || viewer.ipAddress !== ipAddress) return;

    viewer.ipLocation = location ?? null;
    viewer.ipLocationStatus = location ? 'resolved' : 'unavailable';
  }

  private buildOwnerStatus(
    session: BroadcastSession,
  ): BroadcastOwnerSessionStatus {
    const heartbeatStatus = buildOwnerStatus(
      session,
      this.viewerHeartbeats,
      BroadcastService.VIEWER_STALE_MS,
    );
    const viewers = session.enabled
      ? this.cleanupViewerTelemetry(session.shareToken, Date.now())
      : [];

    return {
      ...heartbeatStatus,
      viewerCount: viewers.length,
      viewers,
    };
  }

  private cleanupViewerTelemetry(
    shareToken: string,
    nowMs: number,
  ): BroadcastViewerStatus[] {
    const viewers = this.viewerTelemetry.get(shareToken);
    if (!viewers) return [];

    for (const [viewerKey, viewer] of viewers) {
      if (nowMs - viewer.lastSeenMs > BroadcastService.VIEWER_STALE_MS) {
        viewers.delete(viewerKey);
      }
    }
    if (viewers.size === 0) {
      this.viewerTelemetry.delete(shareToken);
      return [];
    }

    return [...viewers.values()]
      .sort((left, right) => right.lastSeenMs - left.lastSeenMs)
      .map((viewer) => ({
        ipAddress: viewer.ipAddress,
        clientType: viewer.clientType,
        networkSpeedBytesPerSecond: viewer.networkSpeedBytesPerSecond,
        ipLocationStatus: viewer.ipLocationStatus,
        ipLocation: viewer.ipLocation,
        lastSeenAt: new Date(viewer.lastSeenMs).toISOString(),
      }));
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
      session &&
      isSessionLiveAtWithGrace(
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

  async resolvePublicDirectHlsSessionId(
    shareTokenInput: string,
    sourceEpochInput?: string,
  ): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);

    return resolvePublicHlsSessionIdHelper(
      this.streamService,
      session?.enabled ? session : null,
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

  async resolvePublicDirectMediaId(shareTokenInput: string): Promise<string> {
    const shareToken = normalizeShareToken(shareTokenInput);
    const session =
      await this.broadcastSessionStore.getByShareToken(shareToken);
    if (!session?.enabled || !session.mediaId) {
      throw new NotFoundException('Broadcast stream is not active.');
    }

    return session.mediaId;
  }

  private notifyPublicStatus(shareToken: string | null): void {
    if (shareToken) {
      this.publicStatusChanges.next(shareToken);
    }
  }
}

interface BroadcastViewerTelemetryRecord {
  ipAddress: string;
  clientType: BroadcastViewerClientType;
  userAgent: string;
  networkSpeedBytesPerSecond: number | null;
  ipLocationStatus: BroadcastViewerStatus['ipLocationStatus'];
  ipLocation: BroadcastViewerIpLocation | null;
  lastSeenMs: number;
}

function normalizeViewerIpAddress(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 128) : 'Unknown IP';
}

function normalizeViewerUserAgent(value?: string | null): string {
  return value?.trim().slice(0, 512) ?? '';
}

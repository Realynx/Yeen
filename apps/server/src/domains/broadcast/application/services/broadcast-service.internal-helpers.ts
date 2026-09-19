import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StreamService } from '../../../stream/application/services/stream.service';
import type { HlsSessionStatsResponse } from '../../../stream/application/services/stream.types';
import { BroadcastSessionStore } from '../../infrastructure/stores/broadcast-session.store';
import {
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastSession,
  BroadcastStreamSegmentTrackingStatus,
} from '../../domain/entities/broadcast-session.entity';
import {
  createBroadcastSession,
  isBroadcastSessionLiveAt,
  normalizeAccountId,
  resetBroadcastSourceAndPlayback,
  toOwnerStatus,
  toPublicStatus,
} from './broadcast-service.helpers';
import { BroadcastSourceEpochMismatchError } from './broadcast-source-epoch-mismatch.error';

export async function assertStreamSessionMatchesMedia(
  streamService: StreamService,
  hlsSessionId: string,
  mediaId: string,
): Promise<void> {
  try {
    const stats = await streamService.getHlsSessionStats(hlsSessionId);
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

export function cleanupAndCountViewers(
  viewerHeartbeats: Map<string, Map<string, number>>,
  shareToken: string,
  staleMs: number,
  nowMs: number = Date.now(),
): number {
  const heartbeatMap = viewerHeartbeats.get(shareToken);
  if (!heartbeatMap) {
    return 0;
  }

  for (const [viewerId, lastSeenMs] of heartbeatMap.entries()) {
    if (nowMs - lastSeenMs > staleMs) {
      heartbeatMap.delete(viewerId);
    }
  }

  if (heartbeatMap.size === 0) {
    viewerHeartbeats.delete(shareToken);
    return 0;
  }

  return heartbeatMap.size;
}

export function parseExpectedSourceEpoch(value?: string): number | null {
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

export async function resolvePublicHlsSessionId(
  streamService: StreamService,
  session: BroadcastSession | null | undefined,
  sourceEpochInput?: string,
): Promise<string> {
  const expectedSourceEpoch = parseExpectedSourceEpoch(sourceEpochInput);

  if (!session || !session.hlsSessionId) {
    throw new NotFoundException('Broadcast stream is not active.');
  }

  if (
    expectedSourceEpoch !== null &&
    session.sourceEpoch !== expectedSourceEpoch
  ) {
    throw new BroadcastSourceEpochMismatchError();
  }

  try {
    await streamService.getHlsSessionStats(session.hlsSessionId);
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

export function resolvePublicMediaId(
  session: BroadcastSession | null | undefined,
  nowMs: number,
  liveStateGraceMs: number,
  liveStatePlayingGraceMs: number,
): string {
  if (
    !session ||
    !isSessionLiveAtWithGrace(
      session,
      nowMs,
      liveStateGraceMs,
      liveStatePlayingGraceMs,
    ) ||
    !session.mediaId
  ) {
    throw new NotFoundException('Broadcast stream is not active.');
  }

  return session.mediaId;
}

export function isSessionLiveAtWithGrace(
  session: BroadcastSession,
  nowMs: number,
  liveStateGraceMs: number,
  liveStatePlayingGraceMs: number,
): boolean {
  const graceMs =
    session.activePlayer && session.playbackIsPlaying
      ? liveStatePlayingGraceMs
      : liveStateGraceMs;

  return isBroadcastSessionLiveAt(session, nowMs, graceMs);
}

export async function getOrCreateEnabledSession(
  broadcastSessionStore: BroadcastSessionStore,
  ownerAccountIdInput: string,
): Promise<BroadcastSession> {
  const ownerAccountId = normalizeAccountId(ownerAccountIdInput);
  const existing = await broadcastSessionStore.getByOwner(ownerAccountId);
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

export function buildOwnerStatus(
  session: BroadcastSession,
  viewerHeartbeats: Map<string, Map<string, number>>,
  viewerStaleMs: number,
): BroadcastOwnerSessionStatus {
  const viewerCount = session.enabled
    ? cleanupAndCountViewers(
        viewerHeartbeats,
        session.shareToken,
        viewerStaleMs,
      )
    : 0;

  return toOwnerStatus(session, viewerCount);
}

export async function buildPublicStatus(
  streamService: StreamService,
  session: BroadcastSession,
  viewerHeartbeats: Map<string, Map<string, number>>,
  viewerStaleMs: number,
  liveStateGraceMs: number,
  liveStatePlayingGraceMs: number,
): Promise<BroadcastPublicSessionStatus> {
  const nowMs = Date.now();
  const viewerCount = session.enabled
    ? cleanupAndCountViewers(
        viewerHeartbeats,
        session.shareToken,
        viewerStaleMs,
        nowMs,
      )
    : 0;
  const isLive = isSessionLiveAtWithGrace(
    session,
    nowMs,
    liveStateGraceMs,
    liveStatePlayingGraceMs,
  );
  const segmentTracking = await resolveSegmentTrackingStatus(
    streamService,
    session,
    isLive,
  );

  return toPublicStatus(session, viewerCount, isLive, nowMs, segmentTracking);
}

export async function resolveSegmentTrackingStatus(
  streamService: StreamService,
  session: BroadcastSession,
  isLive: boolean,
): Promise<BroadcastStreamSegmentTrackingStatus | null> {
  if (!isLive || !session.hlsSessionId) {
    return null;
  }

  try {
    const stats = await streamService.getHlsSessionStats(session.hlsSessionId);
    return toSegmentTrackingStatus(session, stats);
  } catch {
    // Status polling should remain resilient when stream metrics are transiently unavailable.
    return null;
  }
}

function toSegmentTrackingStatus(
  session: BroadcastSession,
  stats: HlsSessionStatsResponse,
): BroadcastStreamSegmentTrackingStatus | null {
  const segmentSeconds = normalizePositiveNumber(stats.segmentSeconds);
  const readyThroughSeconds = normalizeNonNegativeNumber(
    stats.readyThroughSeconds,
  );
  const contiguousReadySegments = normalizeNonNegativeInteger(
    stats.contiguousReadySegments,
  );
  const highestReadySegment = normalizeNonNegativeInteger(
    stats.highestReadySegment,
  );
  const nextSegmentIndex = normalizeNonNegativeInteger(stats.nextSegmentIndex);

  if (
    segmentSeconds === null &&
    readyThroughSeconds === null &&
    contiguousReadySegments === null &&
    highestReadySegment === null &&
    nextSegmentIndex === null
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

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

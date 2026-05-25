import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import type {
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastSession,
} from '../../domain/entities/broadcast-session.entity';

const VIEWER_ID_MAX_LENGTH = 128;

export function createBroadcastSession(
  ownerAccountId: string,
  nowIso: string,
  enabled: boolean,
): BroadcastSession {
  return {
    ownerAccountId,
    shareToken: createShareToken(),
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

export function clearBroadcastSource(
  session: BroadcastSession,
  nowIso: string,
): void {
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

export function resetBroadcastSourceAndPlayback(
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

export function toOwnerStatus(
  session: BroadcastSession,
  viewerCount: number,
): BroadcastOwnerSessionStatus {
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

export function toPublicStatus(
  session: BroadcastSession,
  viewerCount: number,
  isLive: boolean,
): BroadcastPublicSessionStatus {
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

export function emptyOwnerStatus(): BroadcastOwnerSessionStatus {
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

export function isBroadcastSessionLiveAt(
  session: BroadcastSession,
  nowMs: number,
  liveStateGraceMs: number,
): boolean {
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

  return nowMs - playbackUpdatedAtMs <= liveStateGraceMs;
}

export function normalizeAccountId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException('Invalid account id.');
  }

  return trimmed;
}

export function normalizeShareToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !/^[A-Za-z0-9_-]{12,256}$/.test(trimmed)) {
    throw new NotFoundException('Broadcast was not found.');
  }

  return trimmed;
}

export function normalizeOptionalId(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 128);
}

export function normalizeOptionalSubtitleFileName(
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

export function normalizeSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(0, value);
}

export function normalizeOptionalInteger(
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

export function resolveViewerId(viewerIdInput?: string | null): string {
  if (typeof viewerIdInput === 'string') {
    const trimmed = viewerIdInput.trim();
    if (trimmed) {
      return trimmed.slice(0, VIEWER_ID_MAX_LENGTH);
    }
  }

  return randomBytes(10).toString('hex');
}

function createShareToken(): string {
  return randomBytes(24).toString('base64url');
}

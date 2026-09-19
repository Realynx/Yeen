import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import type {
  BroadcastSubtitleFontPreset,
  BroadcastOwnerSessionStatus,
  BroadcastPublicSessionStatus,
  BroadcastStreamSegmentTrackingStatus,
  BroadcastSession,
} from '../../domain/entities/broadcast-session.entity';

const VIEWER_ID_MAX_LENGTH = 128;
const BROADCAST_SUBTITLE_FONT_PRESETS = new Set<BroadcastSubtitleFontPreset>([
  'clear',
  'rounded',
  'mono',
  'condensed',
]);

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
    sourceEpoch: 0,
    subtitleFileName: null,
    subtitleFontPreset: null,
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
  session.sourceEpoch = nextBroadcastSourceEpoch(session.sourceEpoch);
  session.mediaId = null;
  session.hlsSessionId = null;
  session.subtitleFileName = null;
  session.subtitleFontPreset = null;
  session.activePlayer = false;
  session.selectedAudioStreamIndex = null;
  session.maxVideoBitrateKbps = null;
  session.audioBitrateKbps = null;
  session.maxOutputHeight = null;
  session.playbackPositionSeconds = 0;
  session.playbackIsPlaying = false;
  session.playbackUpdatedAt = nowIso;
  session.playbackSyncTimestampMs = Date.now();
  session.updatedAt = nowIso;
}

export function resetBroadcastSourceAndPlayback(
  session: BroadcastSession,
  nowIso: string,
  nowMs: number,
): void {
  session.sourceEpoch = nextBroadcastSourceEpoch(session.sourceEpoch);
  session.mediaId = null;
  session.hlsSessionId = null;
  session.subtitleFileName = null;
  session.subtitleFontPreset = null;
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
  viewers: BroadcastOwnerSessionStatus['viewers'] = [],
): BroadcastOwnerSessionStatus {
  return {
    enabled: session.enabled,
    activePlayer: session.activePlayer,
    shareToken: session.shareToken,
    mediaId: session.mediaId,
    hlsSessionId: session.hlsSessionId,
    subtitleFileName: session.subtitleFileName,
    subtitleFontPreset: session.subtitleFontPreset,
    playbackPositionSeconds: session.playbackPositionSeconds,
    playbackIsPlaying: session.playbackIsPlaying,
    playbackUpdatedAt: session.playbackUpdatedAt,
    selectedAudioStreamIndex: session.selectedAudioStreamIndex,
    maxVideoBitrateKbps: session.maxVideoBitrateKbps,
    audioBitrateKbps: session.audioBitrateKbps,
    maxOutputHeight: session.maxOutputHeight,
    viewerCount,
    viewers,
    updatedAt: session.updatedAt,
  };
}

export function toPublicStatus(
  session: BroadcastSession,
  viewerCount: number,
  isLive: boolean,
  serverNowMs: number,
  segmentTracking: BroadcastStreamSegmentTrackingStatus | null = null,
): BroadcastPublicSessionStatus {
  const sourceEpoch = normalizeSourceEpoch(session.sourceEpoch);
  const playbackUpdatedAtMs = session.playbackUpdatedAt
    ? Date.parse(session.playbackUpdatedAt)
    : Number.NaN;
  const streamKey =
    session.mediaId && session.hlsSessionId
      ? `${session.mediaId}:${session.hlsSessionId}`
      : null;
  const streamQuery = streamKey
    ? `?stream=${encodeURIComponent(streamKey)}`
    : '';
  const subtitleQuery = new URLSearchParams();
  subtitleQuery.set('sourceEpoch', String(sourceEpoch));
  if (streamKey) {
    subtitleQuery.set('stream', streamKey);
  }
  const subtitleStreamQuery = `?${subtitleQuery.toString()}`;

  return {
    enabled: session.enabled,
    isLive,
    activePlayer: session.activePlayer,
    shareToken: session.shareToken,
    mediaId: session.mediaId,
    sourceEpoch,
    streamKey,
    manifestUrl: isLive
      ? `/api/broadcast/public/${encodeURIComponent(session.shareToken)}/hls/${sourceEpoch}/master.m3u8${streamQuery}`
      : null,
    subtitleUrl:
      session.enabled && session.mediaId && session.subtitleFileName
        ? `/api/broadcast/public/${encodeURIComponent(session.shareToken)}/subtitles/${encodeURIComponent(session.subtitleFileName)}${subtitleStreamQuery}`
        : null,
    subtitleFontPreset: session.subtitleFontPreset,
    playbackPositionSeconds: session.playbackPositionSeconds,
    playbackIsPlaying: session.playbackIsPlaying,
    playbackUpdatedAt: session.playbackUpdatedAt,
    playbackUpdatedAtMs: Number.isFinite(playbackUpdatedAtMs)
      ? playbackUpdatedAtMs
      : null,
    serverNowMs,
    segmentTracking,
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
    subtitleFontPreset: null,
    playbackPositionSeconds: 0,
    playbackIsPlaying: false,
    playbackUpdatedAt: null,
    selectedAudioStreamIndex: null,
    maxVideoBitrateKbps: null,
    audioBitrateKbps: null,
    maxOutputHeight: null,
    viewerCount: 0,
    viewers: [],
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

  const freshestPlaybackTimestampMs = resolveFreshestPlaybackTimestampMs(
    session,
    nowMs,
    liveStateGraceMs,
  );
  if (freshestPlaybackTimestampMs === null) {
    return false;
  }

  return nowMs - freshestPlaybackTimestampMs <= liveStateGraceMs;
}

function resolveFreshestPlaybackTimestampMs(
  session: BroadcastSession,
  nowMs: number,
  liveStateGraceMs: number,
): number | null {
  let freshestTimestampMs = Number.NaN;

  const playbackUpdatedAtMs = session.playbackUpdatedAt
    ? Date.parse(session.playbackUpdatedAt)
    : Number.NaN;
  if (Number.isFinite(playbackUpdatedAtMs)) {
    freshestTimestampMs = playbackUpdatedAtMs;
  }

  const playbackSyncTimestampMs = session.playbackSyncTimestampMs;
  const hasUsableSyncTimestamp =
    typeof playbackSyncTimestampMs === 'number' &&
    Number.isFinite(playbackSyncTimestampMs) &&
    playbackSyncTimestampMs >= 0 &&
    playbackSyncTimestampMs <= nowMs + liveStateGraceMs;

  if (hasUsableSyncTimestamp) {
    freshestTimestampMs = Number.isFinite(freshestTimestampMs)
      ? Math.max(freshestTimestampMs, playbackSyncTimestampMs)
      : playbackSyncTimestampMs;
  }

  return Number.isFinite(freshestTimestampMs) ? freshestTimestampMs : null;
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

export function normalizeOptionalSubtitleFontPreset(
  value: string | null | undefined,
): BroadcastSubtitleFontPreset | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim() as BroadcastSubtitleFontPreset;
  if (!BROADCAST_SUBTITLE_FONT_PRESETS.has(trimmed)) {
    return null;
  }

  return trimmed;
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

export function nextBroadcastSourceEpoch(currentEpoch: number): number {
  return normalizeSourceEpoch(currentEpoch + 1);
}

function normalizeSourceEpoch(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  const normalized = Math.floor(value);
  if (normalized > Number.MAX_SAFE_INTEGER) {
    return 0;
  }

  return normalized;
}

function createShareToken(): string {
  return randomBytes(24).toString('base64url');
}

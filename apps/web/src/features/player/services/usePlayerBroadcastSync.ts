import { useCallback, useEffect, useRef } from 'react';
import type {
  BroadcastPlaybackUpdate,
  BroadcastSourceUpdate,
} from '../../shared/services/types';
import type { PlaybackSource } from './usePlayerData';
import { useBroadcastPlayerLock } from './useBroadcastPlayerLock';

interface UsePlayerBroadcastSyncOptions {
  broadcastEnabled: boolean;
  userId: string;
  mediaId: string;
  loading: boolean;
  switchingToHls: boolean;
  source: PlaybackSource | null;
  selectedAudioStreamIndex: number | null;
  activeSubtitleUrl: string | null;
  subtitleFontPreset: BroadcastSourceUpdate['subtitleFontPreset'];
  effectivePreferredVideoBitrateKbps: number | null;
  effectivePreferredAudioBitrateKbps: number | null;
  effectivePreferredMaxResolutionHeight: number | null;
  currentTime: number;
  isPlaying: boolean;
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  }) => Promise<boolean>;
  updateBroadcastSource: (payload: BroadcastSourceUpdate | null) => Promise<void>;
  updateBroadcastPlayback: (payload: BroadcastPlaybackUpdate) => Promise<void>;
}

interface BroadcastSourceSnapshot {
  hasHls: boolean;
  mediaId: string | null;
  hlsSessionId: string | null;
  subtitleFileName: string | null;
  subtitleFontPreset: BroadcastSourceUpdate['subtitleFontPreset'];
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  maxOutputHeight: number | null;
}

const BROADCAST_PLAYBACK_SYNC_INTERVAL_MS = 500;
const BROADCAST_INACTIVE_SYNC_COOLDOWN_MS = 1200;

const EMPTY_BROADCAST_SOURCE_SNAPSHOT: BroadcastSourceSnapshot = {
  hasHls: false,
  mediaId: null,
  hlsSessionId: null,
  subtitleFileName: null,
  subtitleFontPreset: null,
  selectedAudioStreamIndex: null,
  maxVideoBitrateKbps: null,
  audioBitrateKbps: null,
  maxOutputHeight: null,
};

function toBroadcastSubtitleFileName(subtitleUrl: string | null): string | null {
  if (!subtitleUrl) {
    return null;
  }

  try {
    const parsed = new URL(subtitleUrl, 'http://localhost');
    const segments = parsed.pathname.split('/');
    const fileIndex = segments.findIndex((segment) => segment === 'file');

    if (fileIndex < 0 || fileIndex >= segments.length - 2) {
      return null;
    }

    const encodedFileName = segments.slice(fileIndex + 2).join('/');
    if (!encodedFileName) {
      return null;
    }

    const decoded = decodeURIComponent(encodedFileName).trim();
    if (!decoded || decoded.includes('/') || decoded.includes('\\')) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function usePlayerBroadcastSync({
  broadcastEnabled,
  userId,
  mediaId,
  loading,
  switchingToHls,
  source,
  selectedAudioStreamIndex,
  activeSubtitleUrl,
  subtitleFontPreset,
  effectivePreferredVideoBitrateKbps,
  effectivePreferredAudioBitrateKbps,
  effectivePreferredMaxResolutionHeight,
  currentTime,
  isPlaying,
  switchToHls,
  updateBroadcastSource,
  updateBroadcastPlayback,
}: UsePlayerBroadcastSyncOptions): void {
  const broadcastCurrentTimeRef = useRef(0);
  const broadcastIsPlayingRef = useRef(false);
  const lastInactiveSyncAtRef = useRef(0);
  const broadcastSourceSnapshotRef = useRef<BroadcastSourceSnapshot>(
    EMPTY_BROADCAST_SOURCE_SNAPSHOT,
  );
  const {
    hasBroadcastPlayerLock,
    hasValidBroadcastPlayerLockOwnership,
  } = useBroadcastPlayerLock({
    broadcastEnabled,
    userId,
    mediaId,
  });

  const publishInactivePlaybackState = useCallback(() => {
    if (!broadcastEnabled || !hasValidBroadcastPlayerLockOwnership()) {
      return;
    }

    const sourceSnapshot = broadcastSourceSnapshotRef.current;
    if (!sourceSnapshot.hasHls || !sourceSnapshot.hlsSessionId || !sourceSnapshot.mediaId) {
      return;
    }

    const nowMs = Date.now();
    if (nowMs - lastInactiveSyncAtRef.current < BROADCAST_INACTIVE_SYNC_COOLDOWN_MS) {
      return;
    }

    lastInactiveSyncAtRef.current = nowMs;

    void updateBroadcastPlayback({
      positionSeconds: broadcastCurrentTimeRef.current,
      playbackIsPlaying: false,
      activePlayer: false,
      syncTimestampMs: nowMs,
    });
  }, [
    broadcastEnabled,
    hasValidBroadcastPlayerLockOwnership,
    updateBroadcastPlayback,
  ]);

  useEffect(() => {
    if (!broadcastEnabled || !hasBroadcastPlayerLock) {
      return;
    }

    return () => {
      publishInactivePlaybackState();
    };
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    publishInactivePlaybackState,
  ]);

  useEffect(() => {
    broadcastCurrentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    broadcastIsPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    broadcastSourceSnapshotRef.current = {
      hasHls: Boolean(source?.hls),
      mediaId: mediaId || null,
      hlsSessionId: source?.hls ? source.hlsSessionId : null,
      subtitleFileName: toBroadcastSubtitleFileName(activeSubtitleUrl),
      subtitleFontPreset: source?.hls ? subtitleFontPreset ?? null : null,
      selectedAudioStreamIndex,
      maxVideoBitrateKbps: source?.hls ? source.maxVideoBitrateKbps : null,
      audioBitrateKbps: source?.hls ? source.audioBitrateKbps : null,
      maxOutputHeight: source?.hls ? source.maxOutputHeight : null,
    };
  }, [
    activeSubtitleUrl,
    mediaId,
    selectedAudioStreamIndex,
    subtitleFontPreset,
    source?.audioBitrateKbps,
    source?.hls,
    source?.hlsSessionId,
    source?.maxOutputHeight,
    source?.maxVideoBitrateKbps,
  ]);

  const pushBroadcastPlaybackState = useCallback(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !hasValidBroadcastPlayerLockOwnership()
    ) {
      return;
    }

    const sourceSnapshot = broadcastSourceSnapshotRef.current;
    const hasActiveHlsSource =
      sourceSnapshot.hasHls
      && Boolean(sourceSnapshot.hlsSessionId)
      && Boolean(sourceSnapshot.mediaId);
    const shouldPlay = broadcastIsPlayingRef.current && hasActiveHlsSource;

    void updateBroadcastPlayback({
      positionSeconds: broadcastCurrentTimeRef.current,
      playbackIsPlaying: shouldPlay,
      activePlayer: hasActiveHlsSource,
      syncTimestampMs: Date.now(),
    });
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    hasValidBroadcastPlayerLockOwnership,
    updateBroadcastPlayback,
  ]);

  useEffect(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !hasValidBroadcastPlayerLockOwnership()
      || !mediaId
      || loading
      || switchingToHls
    ) {
      return;
    }

    if (!source || source.hls) {
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
    });
  }, [
    broadcastEnabled,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    loading,
    hasBroadcastPlayerLock,
    mediaId,
    selectedAudioStreamIndex,
    source,
    switchToHls,
    switchingToHls,
    hasValidBroadcastPlayerLockOwnership,
  ]);

  useEffect(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !hasValidBroadcastPlayerLockOwnership()
    ) {
      return;
    }

    const sourceSnapshot = broadcastSourceSnapshotRef.current;
    if (!sourceSnapshot.hasHls || !sourceSnapshot.hlsSessionId || !sourceSnapshot.mediaId) {
      void updateBroadcastSource(null);
      return;
    }

    void updateBroadcastSource({
      mediaId: sourceSnapshot.mediaId,
      hlsSessionId: sourceSnapshot.hlsSessionId,
      subtitleFileName: sourceSnapshot.subtitleFileName,
      subtitleFontPreset: sourceSnapshot.subtitleFontPreset,
      selectedAudioStreamIndex: sourceSnapshot.selectedAudioStreamIndex,
      maxVideoBitrateKbps: sourceSnapshot.maxVideoBitrateKbps,
      audioBitrateKbps: sourceSnapshot.audioBitrateKbps,
      maxOutputHeight: sourceSnapshot.maxOutputHeight,
    }).then(() => {
      pushBroadcastPlaybackState();
    });
  }, [
    activeSubtitleUrl,
    broadcastEnabled,
    hasBroadcastPlayerLock,
    mediaId,
    selectedAudioStreamIndex,
    subtitleFontPreset,
    source?.audioBitrateKbps,
    source?.hls,
    source?.hlsSessionId,
    source?.maxOutputHeight,
    source?.maxVideoBitrateKbps,
    pushBroadcastPlaybackState,
    updateBroadcastSource,
    hasValidBroadcastPlayerLockOwnership,
  ]);

  useEffect(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !hasValidBroadcastPlayerLockOwnership()
    ) {
      return;
    }

    pushBroadcastPlaybackState();

    const intervalId = window.setInterval(() => {
      pushBroadcastPlaybackState();
    }, BROADCAST_PLAYBACK_SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    hasValidBroadcastPlayerLockOwnership,
    mediaId,
    pushBroadcastPlaybackState,
  ]);

  useEffect(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !hasValidBroadcastPlayerLockOwnership()
    ) {
      return;
    }

    pushBroadcastPlaybackState();
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    hasValidBroadcastPlayerLockOwnership,
    isPlaying,
    pushBroadcastPlaybackState,
  ]);

  useEffect(() => {
    if (
      !broadcastEnabled
      || !hasBroadcastPlayerLock
      || !hasValidBroadcastPlayerLockOwnership()
    ) {
      return;
    }

    const syncPlaybackOnVisibilityChange = () => {
      pushBroadcastPlaybackState();
    };

    document.addEventListener('visibilitychange', syncPlaybackOnVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', syncPlaybackOnVisibilityChange);
    };
  }, [
    broadcastEnabled,
    hasBroadcastPlayerLock,
    hasValidBroadcastPlayerLockOwnership,
    pushBroadcastPlaybackState,
  ]);
}

import { useCallback } from 'react';
import { upsertProgress } from '../../shared/services/api';
import type {
  MediaItem,
  PlaybackAudioTrack,
  SubtitleTrack,
} from '../../shared/services/types';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';
import type { PlaybackSource } from './usePlayerData';

interface UsePlayerSeriesPlaybackPreferencesOptions {
  token: string;
  mediaId: string;
  media: MediaItem | null;
  currentTime: number;
  totalDuration: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  progressSyncTimestampRef: React.RefObject<number>;
  audioTracks: PlaybackAudioTrack[];
  selectedAudioStreamIndex: number | null;
  setSelectedAudioStreamIndex: (audioStreamIndex: number | null) => void;
  subtitleTracks: SubtitleTrack[];
  setSelectedSubtitleId: (subtitleId: string) => void;
  setSubtitleVisible: (visible: boolean) => void;
  source: PlaybackSource | null;
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  }) => Promise<boolean>;
  effectivePreferredVideoBitrateKbps: number | null;
  effectivePreferredAudioBitrateKbps: number | null;
  effectivePreferredMaxResolutionHeight: number | null;
}

export interface PlayerSeriesPlaybackPreferences {
  persistSeriesPlaybackPreference: (payload: {
    preferredAudioLanguage?: string | null;
    preferredSubtitleLanguage?: string | null;
    subtitlePreferenceEnabled?: boolean | null;
  }) => Promise<void>;
  handleSelectAudioTrack: (audioStreamIndex: number) => void;
  handleSelectSubtitle: (subtitleId: string) => void;
}

export function usePlayerSeriesPlaybackPreferences({
  token,
  mediaId,
  media,
  currentTime,
  totalDuration,
  videoRef,
  progressSyncTimestampRef,
  audioTracks,
  selectedAudioStreamIndex,
  setSelectedAudioStreamIndex,
  subtitleTracks,
  setSelectedSubtitleId,
  setSubtitleVisible,
  source,
  switchToHls,
  effectivePreferredVideoBitrateKbps,
  effectivePreferredAudioBitrateKbps,
  effectivePreferredMaxResolutionHeight,
}: UsePlayerSeriesPlaybackPreferencesOptions): PlayerSeriesPlaybackPreferences {
  const persistSeriesPlaybackPreference = useCallback(
    async (payload: {
      preferredAudioLanguage?: string | null;
      preferredSubtitleLanguage?: string | null;
      subtitlePreferenceEnabled?: boolean | null;
    }) => {
      if (!mediaId || media?.type !== 'show') {
        return;
      }

      const seriesPreferenceKey = normalizeShowKey(media).trim();
      if (!seriesPreferenceKey) {
        return;
      }

      const video = videoRef.current;
      const safeVideoDuration = Number.isFinite(video?.duration)
        ? Number(video?.duration)
        : totalDuration;
      const syncTimestampMs = Math.max(Date.now(), (progressSyncTimestampRef.current ?? 0) + 1);
      progressSyncTimestampRef.current = syncTimestampMs;

      try {
        await upsertProgress(token, mediaId, {
          positionSeconds: Math.max(0, Math.floor(video?.currentTime ?? currentTime)),
          durationSeconds: Math.max(0, Math.floor(safeVideoDuration || 0)),
          syncTimestampMs,
          completed: false,
          seriesPreferenceKey,
          ...payload,
        });
      } catch {
        // Keep playback uninterrupted if preference persistence fails.
      }
    },
    [currentTime, media, mediaId, progressSyncTimestampRef, token, totalDuration, videoRef],
  );

  const handleSelectAudioTrack = useCallback((audioStreamIndex: number) => {
    if (selectedAudioStreamIndex === audioStreamIndex) {
      return;
    }

    setSelectedAudioStreamIndex(audioStreamIndex);

    const selectedTrack =
      audioTracks.find((track) => track.streamIndex === audioStreamIndex) ?? null;
    void persistSeriesPlaybackPreference({
      preferredAudioLanguage: selectedTrack?.language ?? null,
    });

    const defaultAudioStreamIndex =
      audioTracks.find((track) => track.isDefault)?.streamIndex
      ?? audioTracks[0]?.streamIndex
      ?? null;

    if (source?.hls) {
      const requiresRestart = source.audioStreamIndex !== audioStreamIndex;
      if (requiresRestart) {
        void switchToHls({
          forceFresh: true,
          audioStreamIndex,
          maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
          audioBitrateKbps: effectivePreferredAudioBitrateKbps,
          maxOutputHeight: effectivePreferredMaxResolutionHeight,
        });
      }
      return;
    }

    if (
      defaultAudioStreamIndex !== null
      && audioStreamIndex !== defaultAudioStreamIndex
    ) {
      void switchToHls({
        audioStreamIndex,
        maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
        audioBitrateKbps: effectivePreferredAudioBitrateKbps,
        maxOutputHeight: effectivePreferredMaxResolutionHeight,
      });
    }
  }, [
    audioTracks,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    persistSeriesPlaybackPreference,
    selectedAudioStreamIndex,
    setSelectedAudioStreamIndex,
    source,
    switchToHls,
  ]);

  const handleSelectSubtitle = useCallback((subtitleId: string) => {
    setSelectedSubtitleId(subtitleId);
    setSubtitleVisible(subtitleId !== '');

    const selectedTrack = subtitleId
      ? subtitleTracks.find((track) => track.id === subtitleId) ?? null
      : null;

    void persistSeriesPlaybackPreference({
      preferredSubtitleLanguage: selectedTrack?.language ?? null,
      subtitlePreferenceEnabled: subtitleId !== '',
    });
  }, [
    persistSeriesPlaybackPreference,
    setSelectedSubtitleId,
    setSubtitleVisible,
    subtitleTracks,
  ]);

  return {
    persistSeriesPlaybackPreference,
    handleSelectAudioTrack,
    handleSelectSubtitle,
  };
}

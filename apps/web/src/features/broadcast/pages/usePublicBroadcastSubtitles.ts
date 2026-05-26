import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  absoluteApiUrl,
  getPublicBroadcastSubtitleTracks,
} from '../../shared/services/api';
import {
  normalizeSubtitleFontPreset,
  SUBTITLE_FONT_OPTIONS,
} from '../../player/services/playerUtils';
import { setupSubtitleTrackSync } from '../../player/services/subtitleTrackSync';
import type { BroadcastStatusSnapshot } from '../services/publicBroadcastPlaybackSync';

interface UsePublicBroadcastSubtitlesOptions {
  resolvedShareToken: string;
  status: BroadcastStatusSnapshot['status'] | null;
  isLiveState: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface UsePublicBroadcastSubtitlesResult {
  activeSubtitleUrl: string | null;
  subtitleVideoStyle: CSSProperties;
  handleSubtitleTrackError: () => void;
}

export function usePublicBroadcastSubtitles({
  resolvedShareToken,
  status,
  isLiveState,
  videoRef,
}: UsePublicBroadcastSubtitlesOptions): UsePublicBroadcastSubtitlesResult {
  const [fallbackSubtitleState, setFallbackSubtitleState] = useState<{
    key: string;
    url: string | null;
  }>({ key: '', url: null });
  const [failedPrimarySubtitleKey, setFailedPrimarySubtitleKey] = useState<string | null>(null);

  const primarySubtitleUrl = status?.subtitleUrl
    ? absoluteApiUrl(status.subtitleUrl)
    : null;
  const subtitleSelectionKey = `${status?.sourceEpoch ?? 'none'}|${primarySubtitleUrl ?? 'none'}`;
  const primarySubtitleLoadFailed = Boolean(
    primarySubtitleUrl && failedPrimarySubtitleKey === subtitleSelectionKey,
  );
  const fallbackSubtitleUrl =
    fallbackSubtitleState.key === subtitleSelectionKey
      ? fallbackSubtitleState.url
      : null;
  const activeSubtitleUrl =
    !primarySubtitleLoadFailed && primarySubtitleUrl
      ? primarySubtitleUrl
      : fallbackSubtitleUrl;

  const activeSubtitleFontPreset = normalizeSubtitleFontPreset(
    status?.subtitleFontPreset,
  );
  const activeSubtitleFontFamily =
    SUBTITLE_FONT_OPTIONS.find((option) => option.id === activeSubtitleFontPreset)?.family
    ?? SUBTITLE_FONT_OPTIONS[0]?.family
    ?? "'Noto Sans', 'Noto Sans JP', 'Segoe UI', sans-serif";
  const subtitleVideoStyle = useMemo<CSSProperties>(() => {
    return {
      '--player-subtitle-font-family': activeSubtitleFontFamily,
    } as CSSProperties;
  }, [activeSubtitleFontFamily]);

  useEffect(() => {
    if (!resolvedShareToken || !isLiveState) {
      return;
    }

    const needsFallbackTrack =
      primarySubtitleUrl === null || primarySubtitleLoadFailed;
    if (!needsFallbackTrack) {
      return;
    }

    let cancelled = false;

    void getPublicBroadcastSubtitleTracks(resolvedShareToken)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const firstTrackUrl = payload.tracks.find((track) => {
          return typeof track.url === 'string' && track.url.trim().length > 0;
        })?.url;

        const nextFallbackUrl = firstTrackUrl
          ? absoluteApiUrl(firstTrackUrl)
          : null;

        setFallbackSubtitleState((previous) => {
          if (
            previous.key === subtitleSelectionKey
            && previous.url === nextFallbackUrl
          ) {
            return previous;
          }

          return {
            key: subtitleSelectionKey,
            url: nextFallbackUrl,
          };
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFallbackSubtitleState((previous) => {
          if (previous.key === subtitleSelectionKey && previous.url === null) {
            return previous;
          }

          return {
            key: subtitleSelectionKey,
            url: null,
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    isLiveState,
    primarySubtitleLoadFailed,
    primarySubtitleUrl,
    resolvedShareToken,
    subtitleSelectionKey,
  ]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    return setupSubtitleTrackSync(video, activeSubtitleUrl);
  }, [activeSubtitleUrl, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const shouldShowSubtitles = Boolean(
      status?.enabled
      && status.isLive
      && status.manifestUrl
      && status.subtitleUrl,
    );

    const syncSubtitleTrackModes = () => {
      const trackList = video.textTracks;
      let activatedTrack = false;

      for (let i = 0; i < trackList.length; i += 1) {
        const track = trackList[i];
        const isSubtitleTrack =
          track.kind === 'subtitles' || track.kind === 'captions';

        if (!shouldShowSubtitles || !isSubtitleTrack) {
          track.mode = 'disabled';
          continue;
        }

        if (!activatedTrack) {
          track.mode = 'showing';
          activatedTrack = true;
          continue;
        }

        track.mode = 'disabled';
      }
    };

    const syncTimerId = window.setTimeout(syncSubtitleTrackModes, 0);
    video.addEventListener('loadedmetadata', syncSubtitleTrackModes);
    video.addEventListener('loadeddata', syncSubtitleTrackModes);
    video.textTracks.addEventListener('addtrack', syncSubtitleTrackModes);

    return () => {
      window.clearTimeout(syncTimerId);
      video.removeEventListener('loadedmetadata', syncSubtitleTrackModes);
      video.removeEventListener('loadeddata', syncSubtitleTrackModes);
      video.textTracks.removeEventListener('addtrack', syncSubtitleTrackModes);
    };
  }, [
    status?.enabled,
    status?.isLive,
    status?.manifestUrl,
    status?.subtitleUrl,
    videoRef,
  ]);

  const handleSubtitleTrackError = useCallback(() => {
    if (!primarySubtitleUrl) {
      return;
    }

    if (activeSubtitleUrl !== primarySubtitleUrl) {
      return;
    }

    setFailedPrimarySubtitleKey(subtitleSelectionKey);
  }, [activeSubtitleUrl, primarySubtitleUrl, subtitleSelectionKey]);

  return {
    activeSubtitleUrl,
    subtitleVideoStyle,
    handleSubtitleTrackError,
  };
}

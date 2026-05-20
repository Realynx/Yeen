import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  extractSubtitle,
  getMedia,
  getPlaybackPlan,
  listProgress,
  listSubtitleTracks,
  startHlsSession,
  toApiErrorMessage,
  withAccessToken,
} from '../../lib/api';
import type { MediaItem, SubtitleTrack } from '../../lib/types';

export interface PlaybackSource {
  url: string;
  hls: boolean;
}

export interface PlayerDataState {
  media: MediaItem | null;
  source: PlaybackSource | null;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleId: string;
  selectedSubtitle: SubtitleTrack | null;
  resumeAtSeconds: number;
  loading: boolean;
  error: string | null;
  switchingToHls: boolean;
  setSelectedSubtitleId: (subtitleId: string) => void;
  extractTrack: (track: SubtitleTrack) => Promise<void>;
  switchToHls: (forceFresh?: boolean) => Promise<boolean>;
}

export function usePlayerData(token: string, mediaId: string): PlayerDataState {
  const AUTO_HLS_RESTART_WINDOW_MS = 30000;
  const MAX_AUTO_HLS_RESTARTS_PER_WINDOW = 2;

  const [media, setMedia] = useState<MediaItem | null>(null);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>('');
  const [resumeAtSeconds, setResumeAtSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingToHls, setSwitchingToHls] = useState(false);
  const autoHlsRestartWindowRef = useRef({
    startedAtMs: 0,
    attempts: 0,
  });

  useEffect(() => {
    autoHlsRestartWindowRef.current = {
      startedAtMs: 0,
      attempts: 0,
    };
  }, [mediaId]);

  const selectedSubtitle = useMemo(() => {
    return subtitleTracks.find((track) => track.id === selectedSubtitleId) ?? null;
  }, [selectedSubtitleId, subtitleTracks]);

  const switchToHls = useCallback(async (forceFresh = false) => {
    if (!mediaId || switchingToHls) {
      return false;
    }

    if (source?.hls && !forceFresh) {
      return false;
    }

    if (forceFresh) {
      const now = Date.now();
      const tracker = autoHlsRestartWindowRef.current;

      if (now - tracker.startedAtMs > AUTO_HLS_RESTART_WINDOW_MS) {
        tracker.startedAtMs = now;
        tracker.attempts = 0;
      }

      if (tracker.attempts >= MAX_AUTO_HLS_RESTARTS_PER_WINDOW) {
        setError('Unable to stabilize the transcoded stream after multiple recovery attempts. Please reload and try again.');
        return false;
      }

      tracker.attempts += 1;
    }

    setSwitchingToHls(true);

    try {
      const hlsSession = await startHlsSession(token, mediaId, forceFresh);
      setSource({
        url: withAccessToken(hlsSession.manifestUrl, token),
        hls: true,
      });
      return true;
    } catch (switchError) {
      setError(toApiErrorMessage(switchError, 'Unable to switch to transcoded playback.'));
      return false;
    } finally {
      setSwitchingToHls(false);
    }
  }, [mediaId, source?.hls, switchingToHls, token]);

  const fetchTracks = useCallback(async () => {
    const tracks = await listSubtitleTracks(token, mediaId);
    setSubtitleTracks(tracks);
    setSelectedSubtitleId((previous) => {
      const existing = tracks.find((track) => track.id === previous && !!track.url);
      if (existing) {
        return previous;
      }

      const firstTrack = tracks.find((track) => !!track.url);
      return firstTrack?.id ?? '';
    });
  }, [mediaId, token]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayer() {
      setLoading(true);
      setError(null);

      try {
        const [mediaInfo, playback, progressEntries] = await Promise.all([
          getMedia(token, mediaId),
          getPlaybackPlan(token, mediaId),
          listProgress(token).catch(() => [] as Awaited<ReturnType<typeof listProgress>>),
        ]);

        if (cancelled) {
          return;
        }

        setMedia(mediaInfo);

        // Apply the saved resume position BEFORE setting the source so that
        // the video element's `loadedmetadata` handler sees a non-zero value
        // and can seek into the stream. Otherwise the initial-seek guard
        // latches at 0 and the saved position is never honored.
        const entry = progressEntries.find((progress) => progress.mediaId === mediaId);
        if (entry && entry.positionSeconds > 15) {
          setResumeAtSeconds(entry.positionSeconds);
        }

        if (playback.directPlay.supported) {
          setSource({
            url: withAccessToken(playback.directPlay.url, token),
            hls: false,
          });
        } else {
          const hlsSession = await startHlsSession(token, mediaId);
          if (cancelled) {
            return;
          }

          setSource({
            url: withAccessToken(hlsSession.manifestUrl, token),
            hls: true,
          });
        }

        await fetchTracks();
      } catch (loadError) {
        setError(toApiErrorMessage(loadError, 'Unable to prepare playback.'));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (mediaId) {
      void loadPlayer();
    }

    return () => {
      cancelled = true;
    };
  }, [fetchTracks, mediaId, token]);

  async function extractTrack(track: SubtitleTrack) {
    if (!track.extractable || typeof track.streamIndex !== 'number') {
      return;
    }

    try {
      await extractSubtitle(token, mediaId, track.streamIndex);
      await fetchTracks();
      setSelectedSubtitleId(track.id);
    } catch (extractError) {
      setError(toApiErrorMessage(extractError, 'Subtitle extraction failed.'));
    }
  }

  return {
    media,
    source,
    subtitleTracks,
    selectedSubtitleId,
    selectedSubtitle,
    resumeAtSeconds,
    loading,
    error,
    switchingToHls,
    setSelectedSubtitleId,
    extractTrack,
    switchToHls,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getMedia,
  getPlaybackPlan,
  listPlaybackAudioTracks,
  listProgress,
  listSubtitleTracks,
  startHlsSession,
  toApiErrorMessage,
  withAccessToken,
} from '../../shared/services/api';
import type { MediaItem, PlaybackAudioTrack, SubtitleTrack } from '../../shared/services/types';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';
import {
  pickPreferredAudioStreamIndex,
  pickPreferredSubtitleTrackToExtract,
  pickPreferredSubtitleTrackId,
  toSeriesPlaybackPreference,
} from './playerDataPreferences';
import type { PlaybackSource, PlayerDataState, PlayerTranscodePreferences } from './playerData.types';
import { extractSubtitleTrackAndReload } from './playerDataSubtitleExtraction';

export type { PlaybackSource, PlayerDataState, PlayerTranscodePreferences } from './playerData.types';

export function usePlayerData(
  token: string,
  mediaId: string,
  transcodePreferences: PlayerTranscodePreferences,
): PlayerDataState {
  const AUTO_HLS_RESTART_WINDOW_MS = 30000;
  const MAX_AUTO_HLS_RESTARTS_PER_WINDOW = 2;
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [streamTorrentHash, setStreamTorrentHash] = useState<string | null>(null);
  const [audioTracks, setAudioTracks] = useState<PlaybackAudioTrack[]>([]);
  const [selectedAudioStreamIndex, setSelectedAudioStreamIndex] = useState<number | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>('');
  const [resumeAtSeconds, setResumeAtSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingToHls, setSwitchingToHls] = useState(false);
  const [extractingSubtitleTrackId, setExtractingSubtitleTrackId] = useState<string | null>(null);
  const transcodePreferencesRef = useRef(transcodePreferences);
  const autoHlsRestartWindowRef = useRef({
    startedAtMs: 0,
    attempts: 0,
  });

  useEffect(() => {
    transcodePreferencesRef.current = transcodePreferences;
  }, [transcodePreferences]);

  useEffect(() => {
    autoHlsRestartWindowRef.current = {
      startedAtMs: 0,
      attempts: 0,
    };
  }, [mediaId]);

  const selectedSubtitle = useMemo(() => {
    return subtitleTracks.find((track) => track.id === selectedSubtitleId) ?? null;
  }, [selectedSubtitleId, subtitleTracks]);
  const pickDefaultAudioStreamIndex = useCallback((tracks: PlaybackAudioTrack[]): number | null => {
    if (tracks.length === 0) {
      return null;
    }

    return tracks.find((track) => track.isDefault)?.streamIndex ?? tracks[0].streamIndex;
  }, []);
  const switchToHls = useCallback(async (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  }) => {
    if (!mediaId || switchingToHls) {
      return false;
    }

    const forceFresh = Boolean(options?.forceFresh);
    const requestedAudioStreamIndex =
      options?.audioStreamIndex !== undefined
        ? options.audioStreamIndex
        : selectedAudioStreamIndex;
    const requestedMaxVideoBitrateKbps =
      options?.maxVideoBitrateKbps !== undefined
        ? options.maxVideoBitrateKbps
        : transcodePreferences.maxVideoBitrateKbps;
    const requestedAudioBitrateKbps =
      options?.audioBitrateKbps !== undefined
        ? options.audioBitrateKbps
        : transcodePreferences.audioBitrateKbps;
    const requestedMaxOutputHeight =
      options?.maxOutputHeight !== undefined
        ? options.maxOutputHeight
        : transcodePreferences.maxOutputHeight;

    if (
      source?.hls
      && !forceFresh
      && source.audioStreamIndex === requestedAudioStreamIndex
      && source.maxVideoBitrateKbps === requestedMaxVideoBitrateKbps
      && source.audioBitrateKbps === requestedAudioBitrateKbps
      && source.maxOutputHeight === requestedMaxOutputHeight
    ) {
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
      const hlsSession = await startHlsSession(token, mediaId, {
        forceFresh,
        audioStreamIndex: requestedAudioStreamIndex,
        maxVideoBitrateKbps: requestedMaxVideoBitrateKbps,
        audioBitrateKbps: requestedAudioBitrateKbps,
        maxOutputHeight: requestedMaxOutputHeight,
      });
      const resolvedAudioStreamIndex =
        hlsSession.selectedAudioStreamIndex ?? requestedAudioStreamIndex ?? null;

      setSource({
        url: withAccessToken(hlsSession.manifestUrl, token),
        hls: true,
        hlsSessionId: hlsSession.sessionId,
        audioStreamIndex: resolvedAudioStreamIndex,
        maxVideoBitrateKbps: hlsSession.maxVideoBitrateKbps,
        audioBitrateKbps: hlsSession.audioBitrateKbps,
        maxOutputHeight: hlsSession.maxOutputHeight,
      });
      setSelectedAudioStreamIndex(resolvedAudioStreamIndex);
      return true;
    } catch (switchError) {
      setError(toApiErrorMessage(switchError, 'Unable to switch to transcoded playback.'));
      return false;
    } finally {
      setSwitchingToHls(false);
    }
  }, [
    mediaId,
    selectedAudioStreamIndex,
    source,
    switchingToHls,
    token,
    transcodePreferences.audioBitrateKbps,
    transcodePreferences.maxOutputHeight,
    transcodePreferences.maxVideoBitrateKbps,
  ]);
  const fetchTracks = useCallback(async (options?: {
    preferredSubtitleLanguage?: string | null;
    subtitlePreferenceEnabled?: boolean | null;
  }) => {
    let tracks = await listSubtitleTracks(token, mediaId);
    const preferredSubtitleLanguage = options?.preferredSubtitleLanguage ?? null;
    const subtitlePreferenceEnabled = options?.subtitlePreferenceEnabled ?? null;

    if (subtitlePreferenceEnabled !== false) {
      const preferredTrackToExtract = pickPreferredSubtitleTrackToExtract(
        tracks,
        preferredSubtitleLanguage,
      );

      if (preferredTrackToExtract) {
        setExtractingSubtitleTrackId(preferredTrackToExtract.id);
        try {
          const extractedResult = await extractSubtitleTrackAndReload(
            token,
            mediaId,
            preferredTrackToExtract,
          );
          tracks = extractedResult.tracks;
        } catch {
          // Keep playback flowing even if automatic preferred subtitle extraction fails.
        } finally {
          setExtractingSubtitleTrackId(null);
        }
      }
    }

    setSubtitleTracks(tracks);

    const preferredSubtitleId = pickPreferredSubtitleTrackId(
      tracks,
      preferredSubtitleLanguage,
    );

    setSelectedSubtitleId((previous) => {
      if (subtitlePreferenceEnabled === false) {
        return '';
      }

      if (preferredSubtitleId) {
        return preferredSubtitleId;
      }

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
      setResumeAtSeconds(0);
      setExtractingSubtitleTrackId(null);
      setStreamTorrentHash(null);
      setAudioTracks([]);

      try {
        const [mediaInfo, playback, progressEntries, playbackAudioTracks] = await Promise.all([
          getMedia(token, mediaId),
          getPlaybackPlan(token, mediaId),
          listProgress(token).catch(() => [] as Awaited<ReturnType<typeof listProgress>>),
          listPlaybackAudioTracks(token, mediaId).catch(
            () => [] as PlaybackAudioTrack[],
          ),
        ]);

        if (cancelled) {
          return;
        }

        setMedia(mediaInfo);
        setStreamTorrentHash(playback.torrent?.hash?.trim() || null);

        const seriesPreferenceKey =
          mediaInfo.type === 'show' ? normalizeShowKey(mediaInfo) : null;
        const seriesPlaybackPreference = toSeriesPlaybackPreference(
          progressEntries,
          seriesPreferenceKey,
        );

        const defaultAudioStreamIndex =
          pickDefaultAudioStreamIndex(playbackAudioTracks);
        const seriesPreferredAudioStreamIndex = pickPreferredAudioStreamIndex(
          playbackAudioTracks,
          seriesPlaybackPreference?.preferredAudioLanguage ?? null,
        );
        const initialAudioStreamIndex =
          seriesPreferredAudioStreamIndex ?? defaultAudioStreamIndex;
        const requiresTranscodedAudio =
          seriesPreferredAudioStreamIndex !== null
          && defaultAudioStreamIndex !== null
          && seriesPreferredAudioStreamIndex !== defaultAudioStreamIndex;

        setAudioTracks(playbackAudioTracks);
        setSelectedAudioStreamIndex((previous) => {
          if (seriesPreferredAudioStreamIndex !== null) {
            return seriesPreferredAudioStreamIndex;
          }

          if (
            previous !== null
            && playbackAudioTracks.some(
              (track) => track.streamIndex === previous,
            )
          ) {
            return previous;
          }
          return initialAudioStreamIndex;
        });
        const entry = progressEntries.find((progress) => progress.mediaId === mediaId);
        if (entry && !entry.completed && entry.positionSeconds > 0) {
          setResumeAtSeconds(entry.positionSeconds);
        }

        if (playback.directPlay.supported && !requiresTranscodedAudio) {
          setSource({
            url: withAccessToken(playback.directPlay.url, token),
            hls: false,
            hlsSessionId: null,
            audioStreamIndex: initialAudioStreamIndex,
            maxVideoBitrateKbps: null,
            audioBitrateKbps: null,
            maxOutputHeight: null,
          });
        } else {
          const latestTranscodePreferences = transcodePreferencesRef.current;
          const hlsSession = await startHlsSession(token, mediaId, {
            audioStreamIndex: initialAudioStreamIndex,
            maxVideoBitrateKbps: latestTranscodePreferences.maxVideoBitrateKbps,
            audioBitrateKbps: latestTranscodePreferences.audioBitrateKbps,
            maxOutputHeight: latestTranscodePreferences.maxOutputHeight,
          });
          if (cancelled) {
            return;
          }

          const resolvedAudioStreamIndex =
            hlsSession.selectedAudioStreamIndex
            ?? initialAudioStreamIndex
            ?? null;

          setSource({
            url: withAccessToken(hlsSession.manifestUrl, token),
            hls: true,
            hlsSessionId: hlsSession.sessionId,
            audioStreamIndex: resolvedAudioStreamIndex,
            maxVideoBitrateKbps: hlsSession.maxVideoBitrateKbps,
            audioBitrateKbps: hlsSession.audioBitrateKbps,
            maxOutputHeight: hlsSession.maxOutputHeight,
          });
          setSelectedAudioStreamIndex(resolvedAudioStreamIndex);
        }

        await fetchTracks({
          preferredSubtitleLanguage:
            seriesPlaybackPreference?.preferredSubtitleLanguage ?? null,
          subtitlePreferenceEnabled:
            seriesPlaybackPreference?.subtitlePreferenceEnabled ?? null,
        });
      } catch (loadError) {
        setStreamTorrentHash(null);
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
  }, [fetchTracks, mediaId, pickDefaultAudioStreamIndex, token]);
  async function extractTrack(track: SubtitleTrack) {
    if (!track.extractable || typeof track.streamIndex !== 'number') {
      return;
    }

    if (extractingSubtitleTrackId) {
      return;
    }

    setExtractingSubtitleTrackId(track.id);
    try {
      const result = await extractSubtitleTrackAndReload(token, mediaId, track);
      setSubtitleTracks(result.tracks);
      setSelectedSubtitleId(result.selectedSubtitleId);
    } catch (extractError) {
      setError(toApiErrorMessage(extractError, 'Subtitle extraction failed.'));
    } finally {
      setExtractingSubtitleTrackId(null);
    }
  }

  return {
    media,
    source,
    streamTorrentHash,
    audioTracks,
    selectedAudioStreamIndex,
    subtitleTracks,
    selectedSubtitleId,
    selectedSubtitle,
    resumeAtSeconds,
    loading,
    error,
    switchingToHls,
    extractingSubtitleTrackId,
    setSelectedAudioStreamIndex,
    setSelectedSubtitleId,
    extractTrack,
    switchToHls,
  };
}

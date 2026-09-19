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
import type {
  MediaItem,
  PlaybackAudioTrack,
  PlaybackPlan,
  SubtitleTrack,
} from '../../shared/services/types';
import { normalizeShowKey } from '../../media-details/services/mediaDetailsUtils';
import {
  pickPreferredAudioStreamIndex,
  pickPreferredSubtitleTrackToExtract,
  pickPreferredSubtitleTrackId,
  toSeriesPlaybackPreference,
} from './playerDataPreferences';
import type {
  HlsSwitchOptions,
  PlaybackSource,
  PlayerDataState,
  PlayerTranscodePreferences,
} from './playerData.types';
import { extractSubtitleTrackAndReload } from './playerDataSubtitleExtraction';
import { readPlaybackPreferences } from './playbackPreferences';
import { withAuthoritativePlaybackDuration } from './playerDataDuration';

export type { PlaybackSource, PlayerDataState, PlayerTranscodePreferences } from './playerData.types';

export function isHlsRecoveryAttempt(options?: HlsSwitchOptions): boolean {
  return options?.forceFresh === true && options.recoveryAttempt === true;
}

export function resolvePlaybackSourceForMedia(
  source: PlaybackSource | null,
  sourceMediaId: string,
  currentMediaId: string,
): PlaybackSource | null {
  return sourceMediaId === currentMediaId ? source : null;
}

function resolveHlsRequest(
  options: HlsSwitchOptions | undefined,
  selectedAudioStreamIndex: number | null,
  preferences: PlayerTranscodePreferences,
) {
  return {
    forceFresh: Boolean(options?.forceFresh),
    audioStreamIndex: options?.audioStreamIndex !== undefined ? options.audioStreamIndex : selectedAudioStreamIndex,
    maxVideoBitrateKbps: options?.maxVideoBitrateKbps !== undefined ? options.maxVideoBitrateKbps : preferences.maxVideoBitrateKbps,
    audioBitrateKbps: options?.audioBitrateKbps !== undefined ? options.audioBitrateKbps : preferences.audioBitrateKbps,
    maxOutputHeight: options?.maxOutputHeight !== undefined ? options.maxOutputHeight : preferences.maxOutputHeight,
  };
}

function sourceMatchesRequest(source: PlaybackSource | null, request: ReturnType<typeof resolveHlsRequest>): boolean {
  return Boolean(source?.hls && !request.forceFresh
    && source.audioStreamIndex === request.audioStreamIndex
    && source.maxVideoBitrateKbps === request.maxVideoBitrateKbps
    && source.audioBitrateKbps === request.audioBitrateKbps
    && source.maxOutputHeight === request.maxOutputHeight);
}

function allowRecoveryAttempt(
  tracker: { startedAtMs: number; attempts: number },
  windowMs: number,
  maxAttempts: number,
): boolean {
  const now = Date.now();
  if (now - tracker.startedAtMs > windowMs) {
    tracker.startedAtMs = now;
    tracker.attempts = 0;
  }
  if (tracker.attempts >= maxAttempts) return false;
  tracker.attempts += 1;
  return true;
}

function defaultAudioStreamIndex(tracks: PlaybackAudioTrack[]): number | null {
  if (tracks.length === 0) return null;
  return tracks.find((track) => track.isDefault)?.streamIndex ?? tracks[0].streamIndex;
}

function retainedAudioStreamIndex(
  previous: number | null,
  preferred: number | null,
  initial: number | null,
  tracks: PlaybackAudioTrack[],
): number | null {
  if (preferred !== null) return preferred;
  if (previous !== null && tracks.some((track) => track.streamIndex === previous)) return previous;
  return initial;
}

function resumePosition(entries: Awaited<ReturnType<typeof listProgress>>, mediaId: string): number {
  const entry = entries.find((progress) => progress.mediaId === mediaId);
  return entry && !entry.completed && entry.positionSeconds > 0 ? entry.positionSeconds : 0;
}

function seriesPreferenceKeyFor(media: MediaItem): string | null {
  return media.type === 'show' ? normalizeShowKey(media) : null;
}

function finishLoading(cancelled: boolean, setLoading: (value: boolean) => void): void {
  if (!cancelled) setLoading(false);
}

async function initialPlaybackSource(
  token: string,
  mediaId: string,
  playback: PlaybackPlan,
  audioStreamIndex: number | null,
  requiresTranscodedAudio: boolean,
  preferences: PlayerTranscodePreferences,
): Promise<{
  source: PlaybackSource;
  audioStreamIndex: number | null;
  durationSeconds: number | null;
}> {
  if (playback.directPlay.supported && !requiresTranscodedAudio) {
    return { source: { url: withAccessToken(playback.directPlay.url, token), hls: false,
      hlsSessionId: null, audioStreamIndex, maxVideoBitrateKbps: null,
      audioBitrateKbps: null, maxOutputHeight: null }, audioStreamIndex,
      durationSeconds: null };
  }
  const session = await startHlsSession(token, mediaId, {
    audioStreamIndex,
    maxVideoBitrateKbps: preferences.maxVideoBitrateKbps,
    audioBitrateKbps: preferences.audioBitrateKbps,
    maxOutputHeight: preferences.maxOutputHeight,
  });
  const resolvedAudio = session.selectedAudioStreamIndex ?? audioStreamIndex ?? null;
  return { source: { url: withAccessToken(session.manifestUrl, token), hls: true,
    hlsSessionId: session.sessionId, audioStreamIndex: resolvedAudio,
    maxVideoBitrateKbps: session.maxVideoBitrateKbps, audioBitrateKbps: session.audioBitrateKbps,
    maxOutputHeight: session.maxOutputHeight }, audioStreamIndex: resolvedAudio,
    durationSeconds: session.totalDurationSeconds };
}

export function usePlayerData(
  token: string,
  mediaId: string,
  transcodePreferences: PlayerTranscodePreferences,
): PlayerDataState {
  const AUTO_HLS_RESTART_WINDOW_MS = 30000;
  const MAX_AUTO_HLS_RESTARTS_PER_WINDOW = 2;
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [sourceMediaId, setSourceMediaId] = useState('');
  const [playbackPlan, setPlaybackPlan] = useState<PlaybackPlan | null>(null);
  const [audioTracks, setAudioTracks] = useState<PlaybackAudioTrack[]>([]);
  const [selectedAudioStreamIndex, setSelectedAudioStreamIndex] = useState<number | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>('');
  const [resumeAtSeconds, setResumeAtSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingToHls, setSwitchingToHls] = useState(false);
  const switchingToHlsRef = useRef(false);
  const [extractingSubtitleTrackId, setExtractingSubtitleTrackId] = useState<string | null>(null);
  const transcodePreferencesRef = useRef(transcodePreferences);
  const tokenRef = useRef(token);
  const autoHlsRestartWindowRef = useRef({
    startedAtMs: 0,
    attempts: 0,
  });

  useEffect(() => {
    transcodePreferencesRef.current = transcodePreferences;
  }, [transcodePreferences]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    autoHlsRestartWindowRef.current = {
      startedAtMs: 0,
      attempts: 0,
    };
  }, [mediaId]);

  const selectedSubtitle = useMemo(() => {
    return subtitleTracks.find((track) => track.id === selectedSubtitleId) ?? null;
  }, [selectedSubtitleId, subtitleTracks]);
  const switchToHls = useCallback(async (options?: HlsSwitchOptions) => {
    if (!mediaId || switchingToHlsRef.current) {
      return false;
    }

    const request = resolveHlsRequest(options, selectedAudioStreamIndex, {
      maxVideoBitrateKbps: transcodePreferences.maxVideoBitrateKbps,
      audioBitrateKbps: transcodePreferences.audioBitrateKbps,
      maxOutputHeight: transcodePreferences.maxOutputHeight,
    });
    if (sourceMatchesRequest(source, request)) return false;

    if (isHlsRecoveryAttempt(options)) {
      if (!allowRecoveryAttempt(autoHlsRestartWindowRef.current,
        AUTO_HLS_RESTART_WINDOW_MS, MAX_AUTO_HLS_RESTARTS_PER_WINDOW)) {
        setError('Unable to stabilize the transcoded stream after multiple recovery attempts. Please reload and try again.');
        return false;
      }
    }

    switchingToHlsRef.current = true;
    setSwitchingToHls(true);
    setError(null);

    try {
      const activeToken = tokenRef.current;
      const hlsSession = await startHlsSession(activeToken, mediaId, {
        ...request,
      });
      const resolvedAudioStreamIndex =
        hlsSession.selectedAudioStreamIndex ?? request.audioStreamIndex ?? null;

      setSourceMediaId(mediaId);
      setSource({
        url: withAccessToken(hlsSession.manifestUrl, activeToken),
        hls: true,
        hlsSessionId: hlsSession.sessionId,
        audioStreamIndex: resolvedAudioStreamIndex,
        maxVideoBitrateKbps: hlsSession.maxVideoBitrateKbps,
        audioBitrateKbps: hlsSession.audioBitrateKbps,
        maxOutputHeight: hlsSession.maxOutputHeight,
      });
      setMedia((previous) =>
        withAuthoritativePlaybackDuration(
          previous,
          hlsSession.totalDurationSeconds,
        ),
      );
      setSelectedAudioStreamIndex(resolvedAudioStreamIndex);
      setError(null);
      return true;
    } catch (switchError) {
      setError(toApiErrorMessage(switchError, 'Unable to switch to transcoded playback.'));
      return false;
    } finally {
      switchingToHlsRef.current = false;
      setSwitchingToHls(false);
    }
  }, [
    mediaId,
    selectedAudioStreamIndex,
    source,
    transcodePreferences.audioBitrateKbps,
    transcodePreferences.maxOutputHeight,
    transcodePreferences.maxVideoBitrateKbps,
  ]);
  const fetchTracks = useCallback(async (options?: {
    preferredSubtitleLanguage?: string | null;
    subtitlePreferenceEnabled?: boolean | null;
  }) => {
    const activeToken = tokenRef.current;
    let tracks = await listSubtitleTracks(activeToken, mediaId);
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
            activeToken,
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
  }, [mediaId]);
  useEffect(() => {
    let cancelled = false;

    async function loadPlayer() {
      setLoading(true);
      setError(null);
      setPlaybackPlan(null);
      setResumeAtSeconds(0);
      setExtractingSubtitleTrackId(null);
      setAudioTracks([]);

      try {
        const [mediaInfo, playback, progressEntries, playbackAudioTracks] = await Promise.all([
          getMedia(tokenRef.current, mediaId),
          getPlaybackPlan(tokenRef.current, mediaId),
          listProgress(tokenRef.current).catch(() => [] as Awaited<ReturnType<typeof listProgress>>),
          listPlaybackAudioTracks(tokenRef.current, mediaId).catch(
            () => [] as PlaybackAudioTrack[],
          ),
        ]);

        if (cancelled) {
          return;
        }

        setMedia(mediaInfo);
        setPlaybackPlan(playback);

        const seriesPreferenceKey = seriesPreferenceKeyFor(mediaInfo);
        const seriesPlaybackPreference = toSeriesPlaybackPreference(
          progressEntries,
          seriesPreferenceKey,
        );
        const playbackPreferences = readPlaybackPreferences();
        const preferredSubtitleLanguage =
          (seriesPlaybackPreference?.preferredSubtitleLanguage
            ?? playbackPreferences.preferredSubtitleLanguage) || null;
        const subtitlePreferenceEnabled =
          seriesPlaybackPreference?.subtitlePreferenceEnabled
          ?? playbackPreferences.subtitlesEnabled;

        const defaultAudioIndex = defaultAudioStreamIndex(playbackAudioTracks);
        const seriesPreferredAudioStreamIndex = pickPreferredAudioStreamIndex(
          playbackAudioTracks,
          seriesPlaybackPreference?.preferredAudioLanguage ?? null,
        );
        const initialAudioStreamIndex =
          seriesPreferredAudioStreamIndex ?? defaultAudioIndex;
        const requiresTranscodedAudio =
          seriesPreferredAudioStreamIndex !== null
          && defaultAudioIndex !== null
          && seriesPreferredAudioStreamIndex !== defaultAudioIndex;

        setAudioTracks(playbackAudioTracks);
        setSelectedAudioStreamIndex((previous) => retainedAudioStreamIndex(
          previous, seriesPreferredAudioStreamIndex, initialAudioStreamIndex, playbackAudioTracks,
        ));
        setResumeAtSeconds(resumePosition(progressEntries, mediaId));
        const initialPlayback = await initialPlaybackSource(tokenRef.current, mediaId, playback,
          initialAudioStreamIndex, requiresTranscodedAudio, transcodePreferencesRef.current);
        if (cancelled) return;
        setSourceMediaId(mediaId);
        setSource(initialPlayback.source);
        setMedia(
          withAuthoritativePlaybackDuration(
            mediaInfo,
            initialPlayback.durationSeconds,
          ),
        );
        if (initialPlayback.source.hls) setSelectedAudioStreamIndex(initialPlayback.audioStreamIndex);

        await fetchTracks({ preferredSubtitleLanguage, subtitlePreferenceEnabled });
      } catch (loadError) {
        setPlaybackPlan(null);
        setError(toApiErrorMessage(loadError, 'Unable to prepare playback.'));
      } finally {
        finishLoading(cancelled, setLoading);
      }
    }

    if (mediaId) {
      void loadPlayer();
    }

    return () => {
      cancelled = true;
    };
  }, [fetchTracks, mediaId]);
  async function extractTrack(track: SubtitleTrack) {
    if (!track.extractable || typeof track.streamIndex !== 'number') {
      return;
    }

    if (extractingSubtitleTrackId) {
      return;
    }

    setExtractingSubtitleTrackId(track.id);
    try {
      const result = await extractSubtitleTrackAndReload(tokenRef.current, mediaId, track);
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
    source: resolvePlaybackSourceForMedia(
      source,
      sourceMediaId,
      mediaId,
    ),
    playbackPlan,
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

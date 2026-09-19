import Hls from 'hls.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toApiErrorMessage } from '../../shared/services/api';
import type { MediaItem } from '../../shared/services/types';
import { createHlsInstance } from '../../player/services/hls/createHls';
import {
  resolveMusicHlsFallbackSource,
  resolveMusicPlaybackSource,
  type MusicPlaybackSource,
} from './musicPlaybackSource';
import {
  createMusicVolumePreference,
  musicPlaybackToggleAction,
  resolveMusicVolumePreference,
  writeMusicVolume,
} from './musicPlaybackState';
import { useMusicProgress } from './useMusicProgress';

export function useMusicPlayback(token: string, accountId: string, tracks: MediaItem[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [source, setSource] = useState<MusicPlaybackSource | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumePreference, setVolumePreference] = useState(() =>
    createMusicVolumePreference(accountId));
  const volume = useMemo(
    () => resolveMusicVolumePreference(accountId, volumePreference),
    [accountId, volumePreference],
  );
  const playRequestRef = useRef(0);
  const attemptedDirectFallbackTrackRef = useRef<string | null>(null);
  const resumePositionRef = useRef(0);

  const currentIndex = useMemo(
    () => tracks.findIndex((track) => track.id === currentTrackId),
    [currentTrackId, tracks],
  );
  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;
  const { prepareTrackPlayback, syncProgress } = useMusicProgress({
    token,
    accountId,
    audioRef,
    currentTrackId,
    fallbackDuration: duration,
    isPlaying,
  });

  const playTrack = useCallback(async (track: MediaItem) => {
    const requestId = playRequestRef.current + 1;
    playRequestRef.current = requestId;
    void syncProgress(false);
    setLoadingTrackId(track.id);
    setError(null);
    setSource(null);
    setIsPlaying(false);
    attemptedDirectFallbackTrackRef.current = null;

    try {
      const [nextSource, resumePosition] = await Promise.all([
        resolveMusicPlaybackSource(token, track.id),
        prepareTrackPlayback(track.id),
      ]);
      if (requestId !== playRequestRef.current) {
        return;
      }

      resumePositionRef.current = resumePosition;
      setCurrentTrackId(track.id);
      setSource(nextSource);
      setCurrentTime(resumePosition);
      setDuration(track.durationSeconds || 0);
    } catch (playError) {
      if (requestId === playRequestRef.current) {
        setError(toApiErrorMessage(playError, 'Unable to play this track.'));
        setIsPlaying(false);
      }
    } finally {
      if (requestId === playRequestRef.current) {
        setLoadingTrackId(null);
      }
    }
  }, [prepareTrackPlayback, syncProgress, token]);

  const playAtIndex = useCallback((index: number) => {
    if (tracks.length === 0) {
      return;
    }

    const normalizedIndex = (index + tracks.length) % tracks.length;
    const track = tracks[normalizedIndex];
    if (track) {
      void playTrack(track);
    }
  }, [playTrack, tracks]);

  const playNext = useCallback(() => {
    playAtIndex(currentIndex >= 0 ? currentIndex + 1 : 0);
  }, [currentIndex, playAtIndex]);

  const playPrevious = useCallback(() => {
    playAtIndex(currentIndex > 0 ? currentIndex - 1 : tracks.length - 1);
  }, [currentIndex, playAtIndex, tracks.length]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    const action = musicPlaybackToggleAction({
      hasCurrentTrack: Boolean(currentTrackId),
      audioPaused: audio?.paused ?? true,
      trackCount: tracks.length,
    });
    if (action === 'start-first') {
      void playTrack(tracks[0]);
      return;
    }

    if (!audio || action === 'none') {
      return;
    }

    if (action === 'play') {
      void audio.play().catch(() => {
        setError('Playback was blocked. Tap play again.');
      });
    } else if (action === 'pause') {
      audio.pause();
    }
  }, [currentTrackId, playTrack, tracks]);

  const seek = useCallback((nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }

    audio.currentTime = Math.max(0, Math.min(nextTime, audio.duration || nextTime));
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const normalizedVolume = Math.max(0, Math.min(1, nextVolume));
    setVolumePreference({
      accountId: accountId.trim() || 'anonymous',
      volume: normalizedVolume,
    });
    writeMusicVolume(accountId, normalizedVolume);
    if (audioRef.current) {
      audioRef.current.volume = normalizedVolume;
    }
  }, [accountId]);

  const handleAudioError = useCallback(() => {
    if (
      source?.kind === 'direct'
      && currentTrackId
      && attemptedDirectFallbackTrackRef.current !== currentTrackId
    ) {
      const fallbackTrackId = currentTrackId;
      const requestId = playRequestRef.current + 1;
      playRequestRef.current = requestId;
      attemptedDirectFallbackTrackRef.current = fallbackTrackId;
      setSource(null);
      setIsPlaying(false);
      setLoadingTrackId(fallbackTrackId);
      setError(null);

      void resolveMusicHlsFallbackSource(token, fallbackTrackId)
        .then((fallbackSource) => {
          if (requestId === playRequestRef.current) {
            setSource(fallbackSource);
          }
        })
        .catch((fallbackError: unknown) => {
          if (requestId === playRequestRef.current) {
            setError(toApiErrorMessage(
              fallbackError,
              'This browser could not play or transcode the track.',
            ));
          }
        })
        .finally(() => {
          if (requestId === playRequestRef.current) {
            setLoadingTrackId(null);
          }
        });
      return;
    }

    setIsPlaying(false);
    setError('This track could not be played.');
  }, [currentTrackId, source?.kind, token]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    destroyHls();
    resetAudioElement(audio);

    if (!source) {
      return;
    }

    let removePendingMetadataListener: (() => void) | null = null;
    const startPlayback = () => {
      setError(null);
      const beginPlayback = () => {
        removePendingMetadataListener = null;
        const resumePosition = resumePositionRef.current;
        if (resumePosition > 0) {
          const maxTime = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : resumePosition;
          audio.currentTime = Math.min(resumePosition, maxTime);
          setCurrentTime(audio.currentTime);
        }

        void audio.play().catch(() => {
          setIsPlaying(false);
          setError('Playback is ready. Tap play to begin.');
        });
      };

      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        beginPlayback();
        return;
      }

      audio.addEventListener('loadedmetadata', beginPlayback, { once: true });
      removePendingMetadataListener = () => {
        audio.removeEventListener('loadedmetadata', beginPlayback);
      };
    };

    if (source.kind === 'direct') {
      audio.src = source.url;
      audio.load();
      startPlayback();
    } else if (Hls.isSupported()) {
      const hls = createHlsInstance();
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return;
        }
        setIsPlaying(false);
        setError('The transcoded music stream stopped unexpectedly. Try the track again.');
      });
      hls.loadSource(source.url);
      hls.attachMedia(audio);
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = source.url;
      audio.load();
      startPlayback();
    } else {
      setError('This browser cannot play the transcoded music stream.');
    }

    return () => {
      removePendingMetadataListener?.();
      destroyHls();
      resetAudioElement(audio);
    };

    function destroyHls() {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    }

    function resetAudioElement(target: HTMLAudioElement) {
      target.pause();
      target.removeAttribute('src');
      target.load();
    }
  }, [source]);

  useEffect(() => {
    return () => {
      playRequestRef.current += 1;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  return {
    audioRef,
    currentTrack,
    currentTrackId,
    isPlaying,
    loadingTrackId,
    error,
    currentTime,
    duration,
    volume,
    playTrack,
    playNext,
    playPrevious,
    togglePlayback,
    seek,
    setVolume,
    audioEvents: {
      onPlay: () => setIsPlaying(true),
      onPause: () => {
        setIsPlaying(false);
        void syncProgress(false);
      },
      onTimeUpdate: () => setCurrentTime(audioRef.current?.currentTime ?? 0),
      onDurationChange: () => setDuration(audioRef.current?.duration || 0),
      onEnded: () => {
        void syncProgress(true);
        playNext();
      },
      onError: handleAudioError,
    },
  };
}

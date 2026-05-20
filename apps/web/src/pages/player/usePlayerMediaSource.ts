import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { PlaybackSource } from './usePlayerData';
import { toHlsLevelLabel, type HlsLevelOption } from './playerUtils';
import { createHlsInstance } from './hls/createHls';
import { attachHlsErrorRecovery } from './hls/useHlsErrorRecovery';

interface UsePlayerMediaSourceOptions {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  source: PlaybackSource | null;
  restartHlsSession: () => Promise<boolean>;
  hasAppliedInitialSeekRef: MutableRefObject<boolean>;
  setPlayerError: (value: string | null) => void;
  setIsBuffering: (value: boolean) => void;
  setCurrentTime: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  setSeekValue: (seconds: number) => void;
  setBufferedPercent: (percent: number) => void;
}

interface UsePlayerMediaSourceResult {
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
  setQualityMode: (value: 'auto' | number) => void;
  currentAutoLevel: number | null;
  attemptedHlsFallbackRef: MutableRefObject<boolean>;
}

export function usePlayerMediaSource({
  videoRef,
  source,
  restartHlsSession,
  hasAppliedInitialSeekRef,
  setPlayerError,
  setIsBuffering,
  setCurrentTime,
  setDuration,
  setSeekValue,
  setBufferedPercent,
}: UsePlayerMediaSourceOptions): UsePlayerMediaSourceResult {
  const hlsRef = useRef<Hls | null>(null);
  const attemptedHlsFallbackRef = useRef(false);

  const [hlsLevels, setHlsLevels] = useState<HlsLevelOption[]>([]);
  const [qualityMode, setQualityMode] = useState<'auto' | number>('auto');
  const [currentAutoLevel, setCurrentAutoLevel] = useState<number | null>(null);

  useEffect(() => {
    attemptedHlsFallbackRef.current = Boolean(source?.hls);
  }, [source?.hls, source?.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) {
      return;
    }

    resetPlayerState();
    resetVideoElement(video);

    if (source.hls) {
      attachHlsSource(video, source.url);
    } else {
      video.src = source.url;
    }

    return () => {
      destroyHls();
      video.pause();
    };

    function resetPlayerState() {
      setPlayerError(null);
      setIsBuffering(true);
      setCurrentTime(0);
      setDuration(0);
      setSeekValue(0);
      setBufferedPercent(0);
      setQualityMode('auto');
      setCurrentAutoLevel(null);
      setHlsLevels([]);
      hasAppliedInitialSeekRef.current = false;
    }

    function resetVideoElement(target: HTMLVideoElement) {
      destroyHls();
      target.pause();
      target.removeAttribute('src');
      target.load();
    }

    function destroyHls() {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }

    function attachHlsSource(target: HTMLVideoElement, url: string) {
      if (Hls.isSupported()) {
        const hls = createHlsInstance();
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setHlsLevels(
            data.levels.map((level, index) => ({
              index,
              label: toHlsLevelLabel(level.height, level.bitrate),
            })),
          );
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          setCurrentAutoLevel(data.level);
        });

        attachHlsErrorRecovery({
          hls,
          restartHlsSession,
          setPlayerError,
          clearHlsRef: () => {
            if (hlsRef.current === hls) {
              hlsRef.current = null;
            }
          },
        });

        hls.loadSource(url);
        hls.attachMedia(target);
        return;
      }

      if (target.canPlayType('application/vnd.apple.mpegurl')) {
        target.src = url;
        return;
      }

      window.setTimeout(() => {
        setPlayerError('This browser does not support HLS playback.');
      }, 0);
    }
  }, [
    hasAppliedInitialSeekRef,
    setBufferedPercent,
    setCurrentTime,
    setDuration,
    setIsBuffering,
    setPlayerError,
    setSeekValue,
    source,
    restartHlsSession,
    videoRef,
  ]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) {
      return;
    }

    hls.currentLevel = qualityMode === 'auto' ? -1 : qualityMode;
  }, [qualityMode]);

  return {
    hlsLevels,
    qualityMode,
    setQualityMode,
    currentAutoLevel,
    attemptedHlsFallbackRef,
  };
}

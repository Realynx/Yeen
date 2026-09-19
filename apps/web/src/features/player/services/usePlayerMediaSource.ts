import Hls, { type FragLoadedData } from "hls.js";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { PlaybackSource } from "./usePlayerData";
import { toHlsLevelLabel, type HlsLevelOption } from "./playerUtils";
import { createHlsInstance } from "./hls/createHls";
import { attachHlsErrorRecovery } from "./hls/useHlsErrorRecovery";

const THROUGHPUT_SAMPLE_WINDOW_MS = 16000;
const THROUGHPUT_SAMPLE_LIMIT = 12;

interface ThroughputSample {
  bitsLoaded: number;
  mediaDurationSeconds: number;
  completedAtMs: number;
}

function toThroughputSample(data: FragLoadedData): ThroughputSample | null {
  const segment = data.part ?? data.frag;
  const stats = segment.stats;

  const bytesLoaded =
    Number.isFinite(stats.total) && stats.total > 0
      ? stats.total
      : stats.loaded;
  const mediaDurationSeconds =
    typeof segment.duration === "number" && Number.isFinite(segment.duration)
      ? segment.duration
      : null;

  if (!Number.isFinite(bytesLoaded) || bytesLoaded <= 0) {
    return null;
  }

  if (mediaDurationSeconds === null || mediaDurationSeconds <= 0) {
    return null;
  }

  return {
    bitsLoaded: bytesLoaded * 8,
    mediaDurationSeconds,
    completedAtMs: Date.now(),
  };
}

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
  qualityMode: "auto" | number;
  setQualityMode: Dispatch<SetStateAction<"auto" | number>>;
  currentAutoLevel: number | null;
  estimatedBandwidthBps: number | null;
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
  const [qualityMode, setQualityMode] = useState<"auto" | number>("auto");
  const [currentAutoLevel, setCurrentAutoLevel] = useState<number | null>(null);
  const [estimatedBandwidthBps, setEstimatedBandwidthBps] = useState<
    number | null
  >(null);

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
      setIsBuffering(false);
      setCurrentTime(0);
      setDuration(0);
      setSeekValue(0);
      setBufferedPercent(0);
      setQualityMode("auto");
      setCurrentAutoLevel(null);
      setHlsLevels([]);
      setEstimatedBandwidthBps(null);
      hasAppliedInitialSeekRef.current = false;
    }

    function resetVideoElement(target: HTMLVideoElement) {
      destroyHls();
      target.pause();
      target.removeAttribute("src");
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
        const throughputSamples: ThroughputSample[] = [];

        const publishMeasuredThroughput = () => {
          const cutoffMs = Date.now() - THROUGHPUT_SAMPLE_WINDOW_MS;

          while (
            throughputSamples.length > 0 &&
            throughputSamples[0].completedAtMs < cutoffMs
          ) {
            throughputSamples.shift();
          }

          while (throughputSamples.length > THROUGHPUT_SAMPLE_LIMIT) {
            throughputSamples.shift();
          }

          if (throughputSamples.length === 0) {
            setEstimatedBandwidthBps(null);
            return;
          }

          const totalBits = throughputSamples.reduce((sum, sample) => {
            return sum + sample.bitsLoaded;
          }, 0);

          const totalMediaDurationSeconds = throughputSamples.reduce(
            (sum, sample) => {
              return sum + sample.mediaDurationSeconds;
            },
            0,
          );

          if (totalBits <= 0 || totalMediaDurationSeconds <= 0) {
            setEstimatedBandwidthBps(null);
            return;
          }

          // Effective stream throughput is based on media time, not burst download
          // speed, so it aligns with transcoder bitrate caps in Stats for Nerds.
          setEstimatedBandwidthBps(
            Math.round(totalBits / totalMediaDurationSeconds),
          );
        };

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

        hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
          const sample = toThroughputSample(data);
          if (sample) {
            throughputSamples.push(sample);
          }
          publishMeasuredThroughput();
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

      if (target.canPlayType("application/vnd.apple.mpegurl")) {
        target.src = url;
        return;
      }

      window.setTimeout(() => {
        setPlayerError("This browser does not support HLS playback.");
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

    hls.currentLevel = qualityMode === "auto" ? -1 : qualityMode;
  }, [qualityMode]);

  return {
    hlsLevels,
    qualityMode,
    setQualityMode,
    currentAutoLevel,
    estimatedBandwidthBps,
    attemptedHlsFallbackRef,
  };
}

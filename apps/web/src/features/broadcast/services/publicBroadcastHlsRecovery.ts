interface PublicBroadcastPlaybackClock {
  currentTime: number;
}

interface PublicBroadcastHlsLoader {
  stopLoad: () => void;
  startLoad: (startPosition?: number, skipSeekToStartPosition?: boolean) => void;
}

interface PublicBroadcastNativePlayback {
  paused: boolean;
  play: () => Promise<void>;
}

export function resumePublicBroadcastHlsLoading(
  video: PublicBroadcastPlaybackClock,
  hls: PublicBroadcastHlsLoader,
): void {
  const currentTime = Number.isFinite(video.currentTime)
    ? Math.max(0, video.currentTime)
    : 0;

  hls.stopLoad();
  hls.startLoad(currentTime, true);
}

export function resumePublicBroadcastNativePlayback(
  video: PublicBroadcastNativePlayback,
  runSync: () => void,
): void {
  runSync();
  if (video.paused) {
    void video.play().catch(() => {
      // Native controls remain available when autoplay requires a gesture.
    });
  }
}

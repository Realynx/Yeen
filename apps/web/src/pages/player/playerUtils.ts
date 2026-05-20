export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  playbackRate: number;
  theaterMode: boolean;
}

export interface HlsLevelOption {
  index: number;
  label: string;
}

export const PLAYER_PREFERENCES_KEY = 'yeen_player_preferences_v1';
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const SKIP_SECONDS = 10;

export function describeMediaError(code: number | undefined): string {
  switch (code) {
    case 1:
      return 'playback aborted';
    case 2:
      return 'network error';
    case 3:
      return 'decode error';
    case 4:
      return 'format unsupported';
    default:
      return 'unknown media error';
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function formatDurationLabel(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function toResolutionBadge(width: number | null, height: number | null): string {
  if (!width || !height) {
    return 'Unknown quality';
  }

  if (height >= 2160) {
    return '4K';
  }

  if (height >= 1080) {
    return '1080p';
  }

  if (height >= 720) {
    return '720p';
  }

  return `${width}x${height}`;
}

export function toHlsLevelLabel(height?: number, bitrate?: number): string {
  const resolution = height ? `${height}p` : 'Adaptive';
  if (!bitrate || bitrate <= 0) {
    return resolution;
  }

  const mbps = (bitrate / 1_000_000).toFixed(1);
  return `${resolution} ${mbps} Mbps`;
}

export function readPlayerPreferences(): PlayerPreferences {
  const defaults: PlayerPreferences = {
    volume: 0.85,
    muted: false,
    playbackRate: 1,
    theaterMode: false,
  };

  try {
    const raw = window.localStorage.getItem(PLAYER_PREFERENCES_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<PlayerPreferences>;
    return {
      volume: clamp(typeof parsed.volume === 'number' ? parsed.volume : defaults.volume, 0, 1),
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : defaults.muted,
      playbackRate: clamp(
        typeof parsed.playbackRate === 'number' ? parsed.playbackRate : defaults.playbackRate,
        0.5,
        2,
      ),
      theaterMode:
        typeof parsed.theaterMode === 'boolean' ? parsed.theaterMode : defaults.theaterMode,
    };
  } catch {
    return defaults;
  }
}

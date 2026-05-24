export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  playbackRate: number;
  theaterMode: boolean;
  subtitleFontPreset: SubtitleFontPreset;
  preferredVideoBitrateKbps: number | null;
  preferredAudioBitrateKbps: number | null;
  preferredMaxResolutionHeight: number | null;
}

export interface HlsLevelOption {
  index: number;
  label: string;
}

export type SubtitleFontPreset = 'clear' | 'rounded' | 'mono' | 'condensed';

interface SubtitleFontOption {
  id: SubtitleFontPreset;
  label: string;
  family: string;
}

export const SUBTITLE_FONT_OPTIONS: SubtitleFontOption[] = [
  {
    id: 'clear',
    label: 'Clear Sans',
    family: "'Noto Sans', 'Noto Sans JP', 'Segoe UI', sans-serif",
  },
  {
    id: 'rounded',
    label: 'Rounded Sans',
    family: "'Trebuchet MS', 'Verdana', 'Segoe UI', sans-serif",
  },
  {
    id: 'mono',
    label: 'Mono',
    family: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
  },
  {
    id: 'condensed',
    label: 'Condensed Sans',
    family: "'Arial Narrow', 'Roboto Condensed', 'Noto Sans', 'Segoe UI', sans-serif",
  },
];

const DEFAULT_SUBTITLE_FONT_PRESET: SubtitleFontPreset = 'condensed';

function isSubtitleFontPreset(value: unknown): value is SubtitleFontPreset {
  return SUBTITLE_FONT_OPTIONS.some((option) => option.id === value);
}

export function normalizeSubtitleFontPreset(value: unknown): SubtitleFontPreset {
  return isSubtitleFontPreset(value) ? value : DEFAULT_SUBTITLE_FONT_PRESET;
}

export const PLAYER_PREFERENCES_KEY = 'yeen_player_preferences_v1';
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const SKIP_SECONDS = 10;
export const STANDARD_RESOLUTION_HEIGHT_OPTIONS = [360, 480, 720, 1080, 1440, 2160] as const;
export const STANDARD_VIDEO_BITRATE_OPTIONS_KBPS = [
  1200,
  1800,
  2500,
  3500,
  4500,
  6000,
  8000,
  12000,
  16000,
  22000,
] as const;
export const STANDARD_AUDIO_BITRATE_OPTIONS_KBPS = [64, 96, 128, 160, 192, 256, 320] as const;

const RESOLUTION_RECOMMENDED_VIDEO_BITRATE_KBPS: Record<number, number> = {
  360: 900,
  480: 1400,
  720: 2500,
  1080: 4500,
  1440: 8000,
  2160: 14000,
};

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

export function toResolutionOptionLabel(height: number): string {
  if (height >= 2160) {
    return '4K (2160p)';
  }

  return `${height}p`;
}

export function toResolutionBitrateHintKbps(height: number): number {
  return RESOLUTION_RECOMMENDED_VIDEO_BITRATE_KBPS[height] ?? 0;
}

export function toBitrateLabelKbps(kbps: number | null): string {
  if (typeof kbps !== 'number' || !Number.isFinite(kbps) || kbps <= 0) {
    return 'Auto';
  }

  const mbps = kbps / 1000;
  if (mbps >= 10) {
    return `${mbps.toFixed(0)} Mbps`;
  }
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} Mbps`;
  }

  return `${Math.round(kbps)} kbps`;
}

function normalizeOptionalInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(clamp(value, min, max));
}

export function readPlayerPreferences(): PlayerPreferences {
  const defaults: PlayerPreferences = {
    volume: 0.85,
    muted: false,
    playbackRate: 1,
    theaterMode: false,
    subtitleFontPreset: DEFAULT_SUBTITLE_FONT_PRESET,
    preferredVideoBitrateKbps: null,
    preferredAudioBitrateKbps: null,
    preferredMaxResolutionHeight: null,
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
      subtitleFontPreset: normalizeSubtitleFontPreset(parsed.subtitleFontPreset),
      preferredVideoBitrateKbps: normalizeOptionalInteger(
        parsed.preferredVideoBitrateKbps,
        250,
        50000,
      ),
      preferredAudioBitrateKbps: normalizeOptionalInteger(
        parsed.preferredAudioBitrateKbps,
        48,
        384,
      ),
      preferredMaxResolutionHeight: normalizeOptionalInteger(
        parsed.preferredMaxResolutionHeight,
        240,
        2160,
      ),
    };
  } catch {
    return defaults;
  }
}

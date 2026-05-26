import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import type {
  HlsSessionStats,
  MediaItem,
  PlaybackAudioTrack,
  SubtitleTrack,
  TorrentItem,
} from '../../../shared/services/types';
import type {
  HlsLevelOption,
  SubtitleFontPreset,
} from '../../services/playerUtils';

export interface PlayerVideoTelemetry {
  readyState: number;
  networkState: number;
  droppedVideoFrames: number | null;
  totalVideoFrames: number | null;
  bufferedAheadSeconds: number;
  bufferedEndSeconds: number;
  renderedWidth: number | null;
  renderedHeight: number | null;
}

export interface PlayerContextMenuState {
  x: number;
  y: number;
}

export interface PlayerVideoPanelProps {
  token: string;
  media: MediaItem | null;
  audioTracks: PlaybackAudioTrack[];
  selectedAudioStreamIndex: number | null;
  onSelectAudioTrack: (audioStreamIndex: number) => void;
  activeSubtitle: SubtitleTrack | null;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleId: string;
  onSelectSubtitle: (subtitleId: string) => void;
  onExtractSubtitle: (track: SubtitleTrack) => void;
  extractingSubtitleTrackId: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  videoShellRef: RefObject<HTMLDivElement | null>;
  isControlsVisible: boolean;
  isPlaying: boolean;
  isSeeking: boolean;
  isBuffering: boolean;
  isFullscreen: boolean;
  isPictureInPicture: boolean;
  canUsePictureInPicture: boolean;
  canCast: boolean;
  castDeviceAvailable: boolean;
  isCasting: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  subtitleFontPreset: SubtitleFontPreset;
  theaterMode: boolean;
  isPhoneMode?: boolean;
  isTvMode?: boolean;
  currentTime: number;
  totalDuration: number;
  safeDuration: number;
  playedPercent: number;
  bufferedPercent: number;
  seekValue: number;
  seekPreviewSeconds: number | null;
  qualityStatus: string;
  isHlsSource: boolean;
  estimatedBandwidthBps: number | null;
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
  videoBitrateQuotaKbps: number;
  videoBitrateOptionsKbps: number[];
  audioBitrateOptionsKbps: number[];
  resolutionHeightOptions: number[];
  preferredVideoBitrateKbps: number | null;
  preferredAudioBitrateKbps: number | null;
  preferredMaxResolutionHeight: number | null;
  appliedVideoBitrateKbps: number | null;
  appliedAudioBitrateKbps: number | null;
  appliedMaxOutputHeight: number | null;
  showNerdStats: boolean;
  streamSessionId: string | null;
  streamUrl: string | null;
  hlsSessionStats: HlsSessionStats | null;
  hlsSessionStatsError: string | null;
  hlsSessionStatsUpdatedAt: string | null;
  videoTelemetry: PlayerVideoTelemetry | null;
  downloadingTorrent: TorrentItem | null;
  onRevealControls: () => void;
  onHideControls: () => void;
  onToggleNerdStats: () => void;
  onTogglePlay: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onToggleTheaterMode: () => void;
  onTogglePictureInPicture: () => void;
  onOpenCastPicker: () => void;
  onSkipBy: (deltaSeconds: number) => void;
  onSeekTo: (seconds: number) => void;
  onApplyVolume: (nextVolume: number) => void;
  onPlaybackRateChange: (nextRate: number) => void;
  onSubtitleFontPresetChange: (nextSubtitleFontPreset: SubtitleFontPreset) => void;
  onQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  onPreferredVideoBitrateChange: (nextVideoBitrateKbps: number | null) => void;
  onPreferredAudioBitrateChange: (nextAudioBitrateKbps: number | null) => void;
  onPreferredResolutionChange: (nextMaxResolutionHeight: number | null) => void;
  onClearSeekPreview: () => void;
  onSeekPreview: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onSeekInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSeekPointerDown: () => void;
  onSeekPointerUp: (event: ReactMouseEvent<HTMLInputElement>) => void;
  onSeekTouchEnd: () => void;
  onVideoPlay: () => void;
  onVideoPause: () => void;
  onVideoEnded: () => void;
  onVideoTimeUpdate: () => void;
  onVideoDurationChange: () => void;
  onVideoLoadedMetadata: () => void;
  onVideoProgress: () => void;
  onVideoWaiting: () => void;
  onVideoPlaying: () => void;
  onVideoCanPlay: () => void;
  onVideoError: () => void;
}

import type { RefObject } from 'react';
import { PlayerVideoPanel } from './PlayerVideoPanel';
import type {
  HlsSessionStats,
  MediaItem,
  PlaybackAudioTrack,
  SubtitleTrack,
  TorrentItem,
} from '../../shared/services/types';
import type { HlsLevelOption, SubtitleFontPreset } from '../services/playerUtils';
import type { PlaybackSource } from '../services/usePlayerData';
import type { PlayerVideoTelemetry } from '../services/usePlayerDiagnostics';
import type { PlayerPlaybackRuntime } from '../services/usePlayerPlaybackRuntime';

interface PlayerTrackState {
  audioTracks: PlaybackAudioTrack[];
  selectedAudioStreamIndex: number | null;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleId: string;
  extractingSubtitleTrackId: string | null;
}

interface PlayerPlaybackState {
  activeSubtitle: SubtitleTrack | null;
  isControlsVisible: boolean;
  isPlaying: boolean;
  isSeeking: boolean;
  isBuffering: boolean;
  isFullscreen: boolean;
  isPictureInPicture: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  subtitleFontPreset: SubtitleFontPreset;
  currentTime: number;
  totalDuration: number;
  safeDuration: number;
  playedPercent: number;
  bufferedPercent: number;
  seekValue: number;
  seekPreviewSeconds: number | null;
}

interface PlayerCapabilityState {
  canUsePictureInPicture: boolean;
  canCast: boolean;
  castDeviceAvailable: boolean;
  isCasting: boolean;
}

interface PlayerQualityState {
  qualityStatus: string;
  estimatedBandwidthBps: number | null;
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
  videoBitrateQuotaKbps: number | null;
  videoBitrateOptionsKbps: number[];
  audioBitrateOptionsKbps: number[];
  resolutionHeightOptions: number[];
  preferredVideoBitrateKbps: number | null;
  preferredAudioBitrateKbps: number | null;
  preferredMaxResolutionHeight: number | null;
}

interface PlayerDiagnosticsState {
  showNerdStats: boolean;
  hlsSessionStats: HlsSessionStats | null;
  hlsSessionStatsError: string | null;
  hlsSessionStatsUpdatedAt: string | null;
  videoTelemetry: PlayerVideoTelemetry | null;
  downloadingTorrent: TorrentItem | null;
  toggleNerdStats: () => void;
}

interface PlayerPanelRefs {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoShellRef: RefObject<HTMLDivElement | null>;
}

interface PlayerSelectionHandlers {
  onSelectAudioTrack: (streamIndex: number) => void;
  onSelectSubtitle: (trackId: string) => void;
  onExtractSubtitle: (track: SubtitleTrack) => void;
}

interface PlayerPreferenceHandlers {
  onSubtitleFontPresetChange: (preset: SubtitleFontPreset) => void;
  onQualityModeChange: (mode: 'auto' | number) => void;
  onPreferredVideoBitrateChange: (value: number | null) => void;
  onPreferredAudioBitrateChange: (value: number | null) => void;
  onPreferredResolutionChange: (value: number | null) => void;
}

interface PlayerPanelContainerProps {
  token: string;
  media: MediaItem | null;
  source: PlaybackSource | null;
  redactedStreamUrl: string | null;
  activeTheaterMode: boolean;
  trackState: PlayerTrackState;
  playbackState: PlayerPlaybackState;
  capabilities: PlayerCapabilityState;
  qualityState: PlayerQualityState;
  diagnostics: PlayerDiagnosticsState;
  refs: PlayerPanelRefs;
  runtime: PlayerPlaybackRuntime;
  selectionHandlers: PlayerSelectionHandlers;
  preferenceHandlers: PlayerPreferenceHandlers;
}

export function PlayerPanelContainer({
  token,
  media,
  source,
  redactedStreamUrl,
  activeTheaterMode,
  trackState,
  playbackState,
  capabilities,
  qualityState,
  diagnostics,
  refs,
  runtime,
  selectionHandlers,
  preferenceHandlers,
}: PlayerPanelContainerProps) {
  return (
    <PlayerVideoPanel
      token={token}
      media={media}
      audioTracks={trackState.audioTracks}
      selectedAudioStreamIndex={trackState.selectedAudioStreamIndex}
      onSelectAudioTrack={selectionHandlers.onSelectAudioTrack}
      activeSubtitle={playbackState.activeSubtitle}
      subtitleTracks={trackState.subtitleTracks}
      selectedSubtitleId={trackState.selectedSubtitleId}
      onSelectSubtitle={selectionHandlers.onSelectSubtitle}
      onExtractSubtitle={selectionHandlers.onExtractSubtitle}
      extractingSubtitleTrackId={trackState.extractingSubtitleTrackId}
      videoRef={refs.videoRef}
      videoShellRef={refs.videoShellRef}
      isControlsVisible={playbackState.isControlsVisible}
      isPlaying={playbackState.isPlaying}
      isSeeking={playbackState.isSeeking}
      isBuffering={playbackState.isBuffering}
      isFullscreen={playbackState.isFullscreen}
      isPictureInPicture={playbackState.isPictureInPicture}
      canUsePictureInPicture={capabilities.canUsePictureInPicture}
      canCast={capabilities.canCast}
      castDeviceAvailable={capabilities.castDeviceAvailable}
      isCasting={capabilities.isCasting}
      muted={playbackState.muted}
      volume={playbackState.volume}
      playbackRate={playbackState.playbackRate}
      subtitleFontPreset={playbackState.subtitleFontPreset}
      theaterMode={activeTheaterMode}
      currentTime={playbackState.currentTime}
      totalDuration={playbackState.totalDuration}
      safeDuration={playbackState.safeDuration}
      playedPercent={playbackState.playedPercent}
      bufferedPercent={playbackState.bufferedPercent}
      seekValue={playbackState.seekValue}
      seekPreviewSeconds={playbackState.seekPreviewSeconds}
      qualityStatus={qualityState.qualityStatus}
      isHlsSource={Boolean(source?.hls)}
      estimatedBandwidthBps={qualityState.estimatedBandwidthBps}
      hlsLevels={qualityState.hlsLevels}
      qualityMode={qualityState.qualityMode}
      videoBitrateQuotaKbps={qualityState.videoBitrateQuotaKbps ?? 0}
      videoBitrateOptionsKbps={qualityState.videoBitrateOptionsKbps}
      audioBitrateOptionsKbps={qualityState.audioBitrateOptionsKbps}
      resolutionHeightOptions={qualityState.resolutionHeightOptions}
      preferredVideoBitrateKbps={qualityState.preferredVideoBitrateKbps}
      preferredAudioBitrateKbps={qualityState.preferredAudioBitrateKbps}
      preferredMaxResolutionHeight={qualityState.preferredMaxResolutionHeight}
      appliedVideoBitrateKbps={source?.hls ? source.maxVideoBitrateKbps : null}
      appliedAudioBitrateKbps={source?.hls ? source.audioBitrateKbps : null}
      appliedMaxOutputHeight={source?.hls ? source.maxOutputHeight : null}
      showNerdStats={diagnostics.showNerdStats}
      streamSessionId={source?.hls ? source.hlsSessionId : null}
      streamUrl={redactedStreamUrl}
      hlsSessionStats={diagnostics.hlsSessionStats}
      hlsSessionStatsError={diagnostics.hlsSessionStatsError}
      hlsSessionStatsUpdatedAt={diagnostics.hlsSessionStatsUpdatedAt}
      videoTelemetry={diagnostics.videoTelemetry}
      downloadingTorrent={diagnostics.downloadingTorrent}
      onRevealControls={runtime.revealControls}
      onHideControls={runtime.hideControls}
      onToggleNerdStats={diagnostics.toggleNerdStats}
      onTogglePlay={runtime.togglePlay}
      onToggleFullscreen={runtime.toggleFullscreen}
      onToggleMute={runtime.toggleMute}
      onToggleTheaterMode={runtime.handleToggleTheaterMode}
      onTogglePictureInPicture={runtime.togglePictureInPicture}
      onOpenCastPicker={runtime.openCastPicker}
      onSkipBy={runtime.skipBy}
      onSeekTo={runtime.seekTo}
      onApplyVolume={runtime.applyVolume}
      onPlaybackRateChange={runtime.handlePlaybackRateChange}
      onSubtitleFontPresetChange={preferenceHandlers.onSubtitleFontPresetChange}
      onQualityModeChange={preferenceHandlers.onQualityModeChange}
      onPreferredVideoBitrateChange={preferenceHandlers.onPreferredVideoBitrateChange}
      onPreferredAudioBitrateChange={preferenceHandlers.onPreferredAudioBitrateChange}
      onPreferredResolutionChange={preferenceHandlers.onPreferredResolutionChange}
      onClearSeekPreview={runtime.clearSeekPreview}
      onSeekPreview={runtime.handleSeekPreview}
      onSeekInputChange={runtime.handleSeekInputChange}
      onSeekPointerDown={runtime.handleSeekPointerDown}
      onSeekPointerUp={runtime.handleSeekPointerUp}
      onSeekTouchEnd={runtime.handleSeekTouchEnd}
      onVideoPlay={runtime.handleVideoPlay}
      onVideoPause={runtime.handleVideoPause}
      onVideoEnded={runtime.handleVideoEndedWithAutoNext}
      onVideoTimeUpdate={runtime.handleTimeUpdate}
      onVideoDurationChange={runtime.handleDurationChange}
      onVideoLoadedMetadata={runtime.handleLoadedMetadata}
      onVideoProgress={runtime.handleBufferedProgress}
      onVideoWaiting={runtime.handleVideoWaiting}
      onVideoPlaying={runtime.handleVideoReady}
      onVideoCanPlay={runtime.handleVideoReady}
      onVideoError={runtime.handleVideoError}
    />
  );
}

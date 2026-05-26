import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react';
import type {
  MediaItem,
  PlaybackAudioTrack,
  SubtitleTrack,
} from '../../../shared/services/types';
import type {
  HlsLevelOption,
  SubtitleFontPreset,
} from '../../services/playerUtils';
import { PlayerControlsLeft } from './PlayerControlsLeft';
import { PlayerControlsRight } from './PlayerControlsRight';
import { PlayerSeekbar } from './PlayerSeekbar';

type MenuId = null | 'audio' | 'subs' | 'settings';

interface PlayerControlsPanelProps {
  showControls: boolean;
  media: MediaItem | null;
  qualityStatus: string;
  safeDuration: number;
  totalDuration: number;
  isSeeking: boolean;
  seekValue: number;
  currentTime: number;
  bufferedPercent: number;
  playedPercent: number;
  seekPreviewSeconds: number | null;
  onSeekTo: (seconds: number) => void;
  onSeekPreview: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onClearSeekPreview: () => void;
  onSeekInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSeekPointerDown: () => void;
  onSeekPointerUp: (event: ReactMouseEvent<HTMLInputElement>) => void;
  onSeekTouchEnd: () => void;
  isPhoneMode: boolean;
  isTvMode: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSkipBy: (deltaSeconds: number) => void;
  onToggleMute: () => void;
  muted: boolean;
  volume: number;
  onApplyVolume: (nextVolume: number) => void;
  menuRootRef: RefObject<HTMLDivElement | null>;
  openMenu: MenuId;
  onToggleMenu: (menu: Exclude<MenuId, null>) => void;
  onCloseMenu: () => void;
  selectedAudioStreamIndex: number | null;
  audioTracks: PlaybackAudioTrack[];
  onSelectAudioTrack: (audioStreamIndex: number) => void;
  activeSubtitle: SubtitleTrack | null;
  selectedSubtitleId: string;
  subtitleTracks: SubtitleTrack[];
  extractingSubtitleTrackId: string | null;
  onSelectSubtitle: (subtitleId: string) => void;
  onExtractSubtitle: (track: SubtitleTrack) => void;
  playbackRate: number;
  subtitleFontPreset: SubtitleFontPreset;
  videoBitrateQuotaKbps: number;
  isHlsSource: boolean;
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
  resolutionHeightOptions: number[];
  preferredMaxResolutionHeight: number | null;
  videoBitrateOptionsKbps: number[];
  preferredVideoBitrateKbps: number | null;
  audioBitrateOptionsKbps: number[];
  preferredAudioBitrateKbps: number | null;
  appliedVideoBitrateKbps: number | null;
  appliedAudioBitrateKbps: number | null;
  appliedMaxOutputHeight: number | null;
  onPlaybackRateChange: (nextRate: number) => void;
  onSubtitleFontPresetChange: (nextSubtitleFontPreset: SubtitleFontPreset) => void;
  onQualityModeChange: (nextQualityMode: 'auto' | number) => void;
  onPreferredVideoBitrateChange: (nextVideoBitrateKbps: number | null) => void;
  onPreferredAudioBitrateChange: (nextAudioBitrateKbps: number | null) => void;
  onPreferredResolutionChange: (nextMaxResolutionHeight: number | null) => void;
  canCast: boolean;
  isCasting: boolean;
  castDeviceAvailable: boolean;
  onOpenCastPicker: () => void;
  theaterMode: boolean;
  onToggleTheaterMode: () => void;
  canUsePictureInPicture: boolean;
  isPictureInPicture: boolean;
  onTogglePictureInPicture: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function PlayerControlsPanel({
  showControls,
  media,
  qualityStatus,
  safeDuration,
  totalDuration,
  isSeeking,
  seekValue,
  currentTime,
  bufferedPercent,
  playedPercent,
  seekPreviewSeconds,
  onSeekTo,
  onSeekPreview,
  onClearSeekPreview,
  onSeekInputChange,
  onSeekPointerDown,
  onSeekPointerUp,
  onSeekTouchEnd,
  isPhoneMode,
  isTvMode,
  isPlaying,
  onTogglePlay,
  onSkipBy,
  onToggleMute,
  muted,
  volume,
  onApplyVolume,
  menuRootRef,
  openMenu,
  onToggleMenu,
  onCloseMenu,
  selectedAudioStreamIndex,
  audioTracks,
  onSelectAudioTrack,
  activeSubtitle,
  selectedSubtitleId,
  subtitleTracks,
  extractingSubtitleTrackId,
  onSelectSubtitle,
  onExtractSubtitle,
  playbackRate,
  subtitleFontPreset,
  videoBitrateQuotaKbps,
  isHlsSource,
  hlsLevels,
  qualityMode,
  resolutionHeightOptions,
  preferredMaxResolutionHeight,
  videoBitrateOptionsKbps,
  preferredVideoBitrateKbps,
  audioBitrateOptionsKbps,
  preferredAudioBitrateKbps,
  appliedVideoBitrateKbps,
  appliedAudioBitrateKbps,
  appliedMaxOutputHeight,
  onPlaybackRateChange,
  onSubtitleFontPresetChange,
  onQualityModeChange,
  onPreferredVideoBitrateChange,
  onPreferredAudioBitrateChange,
  onPreferredResolutionChange,
  canCast,
  isCasting,
  castDeviceAvailable,
  onOpenCastPicker,
  theaterMode,
  onToggleTheaterMode,
  canUsePictureInPicture,
  isPictureInPicture,
  onTogglePictureInPicture,
  isFullscreen,
  onToggleFullscreen,
}: PlayerControlsPanelProps) {
  return (
    <div className={`player-controls-panel ${showControls ? 'is-visible' : 'is-hidden'} ${isTvMode ? 'is-tv-mode' : ''}`}>
      <div className="player-controls-top">
        <div className="player-title-block">
          <h2>{media?.title ?? 'Preparing stream…'}</h2>
        </div>
        <div className="player-inline-badges" aria-label="Playback metadata">
          <span>{qualityStatus}</span>
        </div>
      </div>

      <div className="player-controls-lower">
        <PlayerSeekbar
          media={media}
          safeDuration={safeDuration}
          totalDuration={totalDuration}
          isSeeking={isSeeking}
          seekValue={seekValue}
          currentTime={currentTime}
          bufferedPercent={bufferedPercent}
          playedPercent={playedPercent}
          seekPreviewSeconds={seekPreviewSeconds}
          onSeekTo={onSeekTo}
          onSeekPreview={onSeekPreview}
          onClearSeekPreview={onClearSeekPreview}
          onSeekInputChange={onSeekInputChange}
          onSeekPointerDown={onSeekPointerDown}
          onSeekPointerUp={onSeekPointerUp}
          onSeekTouchEnd={onSeekTouchEnd}
        />

        <div className="player-controls-bottom">
          <PlayerControlsLeft
            isPhoneMode={isPhoneMode}
            isPlaying={isPlaying}
            onTogglePlay={onTogglePlay}
            onSkipBy={onSkipBy}
            onToggleMute={onToggleMute}
            muted={muted}
            volume={volume}
            onApplyVolume={onApplyVolume}
            currentTime={currentTime}
            totalDuration={totalDuration}
          />

          <PlayerControlsRight
            menuRootRef={menuRootRef}
            openMenu={openMenu}
            onToggleMenu={onToggleMenu}
            onCloseMenu={onCloseMenu}
            selectedAudioStreamIndex={selectedAudioStreamIndex}
            audioTracks={audioTracks}
            onSelectAudioTrack={onSelectAudioTrack}
            activeSubtitle={activeSubtitle}
            selectedSubtitleId={selectedSubtitleId}
            subtitleTracks={subtitleTracks}
            extractingSubtitleTrackId={extractingSubtitleTrackId}
            onSelectSubtitle={onSelectSubtitle}
            onExtractSubtitle={onExtractSubtitle}
            isPhoneMode={isPhoneMode}
            isTvMode={isTvMode}
            playbackRate={playbackRate}
            subtitleFontPreset={subtitleFontPreset}
            videoBitrateQuotaKbps={videoBitrateQuotaKbps}
            isHlsSource={isHlsSource}
            hlsLevels={hlsLevels}
            qualityMode={qualityMode}
            resolutionHeightOptions={resolutionHeightOptions}
            preferredMaxResolutionHeight={preferredMaxResolutionHeight}
            videoBitrateOptionsKbps={videoBitrateOptionsKbps}
            preferredVideoBitrateKbps={preferredVideoBitrateKbps}
            audioBitrateOptionsKbps={audioBitrateOptionsKbps}
            preferredAudioBitrateKbps={preferredAudioBitrateKbps}
            appliedVideoBitrateKbps={appliedVideoBitrateKbps}
            appliedAudioBitrateKbps={appliedAudioBitrateKbps}
            appliedMaxOutputHeight={appliedMaxOutputHeight}
            onPlaybackRateChange={onPlaybackRateChange}
            onSubtitleFontPresetChange={onSubtitleFontPresetChange}
            onQualityModeChange={onQualityModeChange}
            onPreferredVideoBitrateChange={onPreferredVideoBitrateChange}
            onPreferredAudioBitrateChange={onPreferredAudioBitrateChange}
            onPreferredResolutionChange={onPreferredResolutionChange}
            canCast={canCast}
            isCasting={isCasting}
            castDeviceAvailable={castDeviceAvailable}
            onOpenCastPicker={onOpenCastPicker}
            theaterMode={theaterMode}
            onToggleTheaterMode={onToggleTheaterMode}
            canUsePictureInPicture={canUsePictureInPicture}
            isPictureInPicture={isPictureInPicture}
            onTogglePictureInPicture={onTogglePictureInPicture}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      </div>
    </div>
  );
}

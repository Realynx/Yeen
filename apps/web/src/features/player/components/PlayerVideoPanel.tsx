import {
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react';
import { withAccessToken } from '../../shared/services/api';
import {
  SUBTITLE_FONT_OPTIONS,
  formatClock,
} from '../services/playerUtils';
import { resolveActiveChapterSkipAction } from '../services/playerChapterSkip';
import { ChevronRightIcon } from './PlayerIcons';
import { PlayerContextMenu } from './video-panel/PlayerContextMenu';
import { PlayerControlsPanel } from './video-panel/PlayerControlsPanel';
import { PlayerNerdStatsPanel } from './video-panel/PlayerNerdStatsPanel';
import { usePlayerVideoPanelMenus } from './video-panel/usePlayerVideoPanelMenus';
import { usePlayerTvControlsFocus } from './video-panel/usePlayerTvControlsFocus';
import type {
  PlayerVideoPanelProps,
} from './video-panel/PlayerVideoPanel.types';

export function PlayerVideoPanel({
  token,
  media,
  audioTracks,
  selectedAudioStreamIndex,
  onSelectAudioTrack,
  activeSubtitle,
  subtitleTracks,
  selectedSubtitleId,
  onSelectSubtitle,
  onExtractSubtitle,
  extractingSubtitleTrackId,
  videoRef,
  videoShellRef,
  isControlsVisible,
  isPlaying,
  isSeeking,
  isBuffering,
  isFullscreen,
  isPictureInPicture,
  canUsePictureInPicture,
  canCast,
  castDeviceAvailable,
  isCasting,
  muted,
  volume,
  playbackRate,
  subtitleFontPreset,
  theaterMode,
  isPhoneMode = false,
  isTvMode = false,
  currentTime,
  totalDuration,
  safeDuration,
  playedPercent,
  bufferedPercent,
  seekValue,
  seekPreviewSeconds,
  qualityStatus,
  isHlsSource,
  estimatedBandwidthBps,
  hlsLevels,
  qualityMode,
  videoBitrateQuotaKbps,
  videoBitrateOptionsKbps,
  audioBitrateOptionsKbps,
  resolutionHeightOptions,
  preferredVideoBitrateKbps,
  preferredAudioBitrateKbps,
  preferredMaxResolutionHeight,
  appliedVideoBitrateKbps,
  appliedAudioBitrateKbps,
  appliedMaxOutputHeight,
  showNerdStats,
  streamSessionId,
  streamUrl,
  hlsSessionStats,
  hlsSessionStatsError,
  hlsSessionStatsUpdatedAt,
  videoTelemetry,
  downloadingTorrent,
  onRevealControls,
  onHideControls,
  onToggleNerdStats,
  onTogglePlay,
  onToggleFullscreen,
  onToggleMute,
  onToggleTheaterMode,
  onTogglePictureInPicture,
  onOpenCastPicker,
  onSkipBy,
  onSeekTo,
  onApplyVolume,
  onPlaybackRateChange,
  onSubtitleFontPresetChange,
  onQualityModeChange,
  onPreferredVideoBitrateChange,
  onPreferredAudioBitrateChange,
  onPreferredResolutionChange,
  onClearSeekPreview,
  onSeekPreview,
  onSeekInputChange,
  onSeekPointerDown,
  onSeekPointerUp,
  onSeekTouchEnd,
  onVideoPlay,
  onVideoPause,
  onVideoEnded,
  onVideoTimeUpdate,
  onVideoDurationChange,
  onVideoLoadedMetadata,
  onVideoProgress,
  onVideoWaiting,
  onVideoPlaying,
  onVideoCanPlay,
  onVideoError,
}: PlayerVideoPanelProps) {
  const {
    openMenu,
    contextMenu,
    menuRootRef,
    contextMenuRef,
    toggleMenu,
    closeMenu,
    handleContextMenu,
    runContextAction,
  } = usePlayerVideoPanelMenus({ onRevealControls });

  const showControls =
    isControlsVisible
    || !isPlaying
    || isSeeking
    || isBuffering
    || openMenu !== null
    || contextMenu !== null;
  const subtitleFontFamily =
    SUBTITLE_FONT_OPTIONS.find((option) => option.id === subtitleFontPreset)?.family
    ?? SUBTITLE_FONT_OPTIONS[0].family;
  const videoStyle: CSSProperties = {
    ['--player-subtitle-font-family' as string]: subtitleFontFamily,
  };

  const activeSkipAction = useMemo(
    () =>
      resolveActiveChapterSkipAction({
        chapters: media?.chapterThumbnails,
        currentTime,
        totalDuration,
      }),
    [currentTime, media?.chapterThumbnails, totalDuration],
  );

  const handleSkipSegment = useCallback(() => {
    if (!activeSkipAction) {
      return;
    }

    onSeekTo(activeSkipAction.targetSeconds);
    onRevealControls();
  }, [activeSkipAction, onRevealControls, onSeekTo]);

  usePlayerTvControlsFocus({
    isTvMode,
    showControls,
    hasOpenMenu: openMenu !== null || contextMenu !== null,
    videoShellRef,
    closeMenu,
    onHideControls,
  });

  return (
    <div
      ref={videoShellRef}
      className={`video-shell ${showControls ? 'controls-visible' : 'controls-hidden'} ${isFullscreen ? 'is-fullscreen' : ''} ${isTvMode ? 'is-tv-mode' : ''}`}
      tabIndex={isTvMode ? 0 : undefined}
      aria-label={isTvMode ? 'Video player surface' : undefined}
      data-player-video-surface={isTvMode ? 'true' : undefined}
      data-tv-focus-key={isTvMode ? 'player:surface' : undefined}
      onMouseMove={onRevealControls}
      onMouseLeave={() => {
        if (!isTvMode && isPlaying && !isSeeking && !openMenu && !contextMenu) {
          onHideControls();
        }
      }}
      onTouchStart={onRevealControls}
      onContextMenu={handleContextMenu}
    >
      <video
        ref={videoRef}
        className={`player-video ${isFullscreen ? 'is-fullscreen' : ''}`}
        style={videoStyle}
        autoPlay
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        onClick={onTogglePlay}
        onDoubleClick={onToggleFullscreen}
        onPlay={onVideoPlay}
        onPause={onVideoPause}
        onEnded={onVideoEnded}
        onTimeUpdate={onVideoTimeUpdate}
        onDurationChange={onVideoDurationChange}
        onLoadedMetadata={onVideoLoadedMetadata}
        onProgress={onVideoProgress}
        onWaiting={onVideoWaiting}
        onPlaying={onVideoPlaying}
        onCanPlay={onVideoCanPlay}
        onError={onVideoError}
      >
        {activeSubtitle?.url ? (
          <track
            key={`${activeSubtitle.id}-${activeSubtitle.url}`}
            kind="subtitles"
            src={withAccessToken(activeSubtitle.url, token)}
            srcLang={activeSubtitle.language ?? 'en'}
            label={activeSubtitle.label}
            default
          />
        ) : null}
      </video>

      <div className="player-overlay-scrim" aria-hidden="true" />

      <PlayerContextMenu
        contextMenu={contextMenu}
        contextMenuRef={contextMenuRef}
        isPlaying={isPlaying}
        muted={muted}
        isPhoneMode={isPhoneMode}
        theaterMode={theaterMode}
        canUsePictureInPicture={canUsePictureInPicture}
        isPictureInPicture={isPictureInPicture}
        canCast={canCast}
        isCasting={isCasting}
        isFullscreen={isFullscreen}
        showNerdStats={showNerdStats}
        onRunAction={runContextAction}
        onTogglePlay={onTogglePlay}
        onToggleMute={onToggleMute}
        onToggleTheaterMode={onToggleTheaterMode}
        onTogglePictureInPicture={onTogglePictureInPicture}
        onOpenCastPicker={onOpenCastPicker}
        onToggleFullscreen={onToggleFullscreen}
        onToggleNerdStats={onToggleNerdStats}
      />

      {isBuffering ? (
        <div className="player-buffering-badge" aria-label="Buffering" aria-live="polite">
          <span className="player-spinner-ring-gradient" aria-hidden="true" />
        </div>
      ) : null}

      <PlayerNerdStatsPanel
        showNerdStats={showNerdStats}
        onToggleNerdStats={onToggleNerdStats}
        isHlsSource={isHlsSource}
        qualityStatus={qualityStatus}
        playbackRate={playbackRate}
        bufferedPercent={bufferedPercent}
        videoTelemetry={videoTelemetry}
        streamSessionId={streamSessionId}
        hlsSessionStatsUpdatedAt={hlsSessionStatsUpdatedAt}
        hlsSessionStats={hlsSessionStats}
        hlsSessionStatsError={hlsSessionStatsError}
        streamUrl={streamUrl}
        downloadingTorrent={downloadingTorrent}
        estimatedBandwidthBps={estimatedBandwidthBps}
      />

      {activeSkipAction ? (
        <button
          type="button"
          className="player-skip-segment-cta"
          onClick={handleSkipSegment}
          aria-label={
            activeSkipAction.chapterName
              ? `${activeSkipAction.label}: ${activeSkipAction.chapterName}`
              : activeSkipAction.label
          }
          title={`${activeSkipAction.label} to ${formatClock(activeSkipAction.targetSeconds)}`}
        >
          <span className="player-skip-segment-text">
            <span className="player-skip-segment-label">{activeSkipAction.label}</span>
            <span className="player-skip-segment-target">
              {`to ${formatClock(activeSkipAction.targetSeconds)}`}
            </span>
          </span>
          <span className="player-skip-segment-icon" aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </button>
      ) : null}

      <PlayerControlsPanel
        showControls={showControls}
        media={media}
        qualityStatus={qualityStatus}
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
        isPhoneMode={isPhoneMode}
        isTvMode={isTvMode}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onSkipBy={onSkipBy}
        onToggleMute={onToggleMute}
        muted={muted}
        volume={volume}
        onApplyVolume={onApplyVolume}
        menuRootRef={menuRootRef}
        openMenu={openMenu}
        onToggleMenu={toggleMenu}
        onCloseMenu={closeMenu}
        selectedAudioStreamIndex={selectedAudioStreamIndex}
        audioTracks={audioTracks}
        onSelectAudioTrack={onSelectAudioTrack}
        activeSubtitle={activeSubtitle}
        selectedSubtitleId={selectedSubtitleId}
        subtitleTracks={subtitleTracks}
        extractingSubtitleTrackId={extractingSubtitleTrackId}
        onSelectSubtitle={onSelectSubtitle}
        onExtractSubtitle={onExtractSubtitle}
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
  );
}

import {
  useCallback,
  useMemo,
  useState,
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

function subtitlePresentation(
  activeSubtitle: PlayerVideoPanelProps['activeSubtitle'],
  revision: number,
  loadedKey: string | null,
) {
  const key = activeSubtitle?.url ? `${activeSubtitle.id}-${activeSubtitle.url}-${revision}` : null;
  return { key, confirmed: key && loadedKey === key ? activeSubtitle : null };
}

function controlsVisibility(input: {
  isControlsVisible: boolean; isPlaying: boolean; isSeeking: boolean; isBuffering: boolean;
  openMenu: unknown; contextMenu: unknown;
}) {
  return {
    show: input.isControlsVisible || !input.isPlaying || input.isSeeking || input.isBuffering
      || input.openMenu !== null || input.contextMenu !== null,
    dismissible: input.isControlsVisible || input.openMenu !== null || input.contextMenu !== null,
  };
}

function subtitleFontFamilyFor(preset: PlayerVideoPanelProps['subtitleFontPreset']): string {
  return SUBTITLE_FONT_OPTIONS.find((option) => option.id === preset)?.family
    ?? SUBTITLE_FONT_OPTIONS[0].family;
}

function videoShellClass(showControls: boolean, fullscreen: boolean, tvMode: boolean): string {
  return `video-shell ${showControls ? 'controls-visible' : 'controls-hidden'} ${fullscreen ? 'is-fullscreen' : ''} ${tvMode ? 'is-tv-mode' : ''}`;
}

function SubtitleTrackElement({ activeSubtitle, subtitleKey, token, onLoadedKey }: {
  activeSubtitle: PlayerVideoPanelProps['activeSubtitle']; subtitleKey: string | null;
  token: string; onLoadedKey: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  if (!activeSubtitle?.url || !subtitleKey) return null;
  return <track key={subtitleKey} kind="subtitles" src={withAccessToken(activeSubtitle.url, token)}
    srcLang={activeSubtitle.language ?? 'en'} label={activeSubtitle.label} default
    onLoad={() => onLoadedKey(subtitleKey)}
    onError={() => onLoadedKey((loadedKey) => loadedKey === subtitleKey ? null : loadedKey)} />;
}

function BufferingBadge({ buffering }: { buffering: boolean }) {
  return buffering ? <div className="player-buffering-badge" aria-label="Buffering" aria-live="polite">
    <span className="player-spinner-ring-gradient" aria-hidden="true" /></div> : null;
}

type SkipAction = NonNullable<ReturnType<typeof resolveActiveChapterSkipAction>>;
function SkipSegmentButton({ action, onSkip }: { action: SkipAction | null; onSkip: () => void }) {
  if (!action) return null;
  const ariaLabel = action.chapterName ? `${action.label}: ${action.chapterName}` : action.label;
  return <button type="button" className="player-skip-segment-cta" onClick={onSkip}
    aria-label={ariaLabel} title={`${action.label} to ${formatClock(action.targetSeconds)}`}>
    <span className="player-skip-segment-text"><span className="player-skip-segment-label">{action.label}</span>
      <span className="player-skip-segment-target">{`to ${formatClock(action.targetSeconds)}`}</span></span>
    <span className="player-skip-segment-icon" aria-hidden="true"><ChevronRightIcon /></span>
  </button>;
}

export function PlayerVideoPanel({
  token,
  media,
  audioTracks,
  selectedAudioStreamIndex,
  onSelectAudioTrack,
  activeSubtitle,
  subtitleTracks,
  selectedSubtitleId,
  subtitleTrackRevision,
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
  const [loadedSubtitleElementKey, setLoadedSubtitleElementKey] = useState<string | null>(null);
  const subtitle = subtitlePresentation(activeSubtitle, subtitleTrackRevision, loadedSubtitleElementKey);
  const subtitleElementKey = subtitle.key;
  const confirmedActiveSubtitle = subtitle.confirmed;
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

  const visibility = controlsVisibility({ isControlsVisible, isPlaying, isSeeking, isBuffering, openMenu, contextMenu });
  const showControls = visibility.show;
  const controlsCanBeDismissed = visibility.dismissible;
  const subtitleFontFamily = subtitleFontFamilyFor(subtitleFontPreset);
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
      className={videoShellClass(showControls, isFullscreen, isTvMode)}
      tabIndex={isTvMode ? 0 : undefined}
      aria-label={isTvMode ? 'Video player surface' : undefined}
      data-player-video-surface={isTvMode ? 'true' : undefined}
      data-tv-controls-dismissible={isTvMode && controlsCanBeDismissed ? 'true' : undefined}
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
        <SubtitleTrackElement activeSubtitle={activeSubtitle} subtitleKey={subtitleElementKey}
          token={token} onLoadedKey={setLoadedSubtitleElementKey} />
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

      <BufferingBadge buffering={isBuffering} />

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
        estimatedBandwidthBps={estimatedBandwidthBps}
      />

      <SkipSegmentButton action={activeSkipAction} onSkip={handleSkipSegment} />

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
        activeSubtitle={confirmedActiveSubtitle}
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

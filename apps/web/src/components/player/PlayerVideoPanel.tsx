import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { withAccessToken } from '../../lib/api';
import type {
  HlsSessionStats,
  MediaItem,
  PlaybackAudioTrack,
  SubtitleTrack,
  TorrentItem,
} from '../../lib/types';
import {
  clamp,
  formatClock,
  SKIP_SECONDS,
  SPEED_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  type HlsLevelOption,
  type SubtitleFontPreset,
} from '../../pages/player/playerUtils';
import {
  CastIcon,
  CaptionsIcon,
  CheckIcon,
  FullscreenEnterIcon,
  FullscreenExitIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  SettingsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TheaterIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMuteIcon,
} from './PlayerIcons';

interface PlayerVideoTelemetry {
  readyState: number;
  networkState: number;
  droppedVideoFrames: number | null;
  totalVideoFrames: number | null;
  bufferedAheadSeconds: number;
  bufferedEndSeconds: number;
  renderedWidth: number | null;
  renderedHeight: number | null;
}

interface PlayerContextMenuState {
  x: number;
  y: number;
}

interface PlayerVideoPanelProps {
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
  currentTime: number;
  totalDuration: number;
  safeDuration: number;
  playedPercent: number;
  bufferedPercent: number;
  seekValue: number;
  seekPreviewSeconds: number | null;
  qualityStatus: string;
  isHlsSource: boolean;
  hlsLevels: HlsLevelOption[];
  qualityMode: 'auto' | number;
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

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume <= 0.01) {
    return <VolumeMuteIcon />;
  }
  if (volume < 0.5) {
    return <VolumeLowIcon />;
  }
  return <VolumeHighIcon />;
}

function formatStatSeconds(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00s';
  }
  return `${value.toFixed(2)}s`;
}

function formatStatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${value.toFixed(1)}%`;
}

function describeReadyState(value: number): string {
  switch (value) {
    case HTMLMediaElement.HAVE_NOTHING:
      return 'HAVE_NOTHING';
    case HTMLMediaElement.HAVE_METADATA:
      return 'HAVE_METADATA';
    case HTMLMediaElement.HAVE_CURRENT_DATA:
      return 'HAVE_CURRENT_DATA';
    case HTMLMediaElement.HAVE_FUTURE_DATA:
      return 'HAVE_FUTURE_DATA';
    case HTMLMediaElement.HAVE_ENOUGH_DATA:
      return 'HAVE_ENOUGH_DATA';
    default:
      return `UNKNOWN (${value})`;
  }
}

function describeNetworkState(value: number): string {
  switch (value) {
    case HTMLMediaElement.NETWORK_EMPTY:
      return 'NETWORK_EMPTY';
    case HTMLMediaElement.NETWORK_IDLE:
      return 'NETWORK_IDLE';
    case HTMLMediaElement.NETWORK_LOADING:
      return 'NETWORK_LOADING';
    case HTMLMediaElement.NETWORK_NO_SOURCE:
      return 'NETWORK_NO_SOURCE';
    default:
      return `UNKNOWN (${value})`;
  }
}

function toStatsTimestamp(value: string | null): string {
  if (!value) {
    return 'Not yet polled';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString();
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
  onSelectSubtitle,
  onExtractSubtitle,
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
  currentTime,
  totalDuration,
  safeDuration,
  playedPercent,
  bufferedPercent,
  seekValue,
  seekPreviewSeconds,
  qualityStatus,
  isHlsSource,
  hlsLevels,
  qualityMode,
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
  const [openMenu, setOpenMenu] = useState<null | 'audio' | 'subs' | 'settings'>(null);
  const [contextMenu, setContextMenu] = useState<PlayerContextMenuState | null>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu && !contextMenu) {
      return;
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const inControlsMenu = menuRootRef.current?.contains(target) ?? false;
      const inContextMenu = contextMenuRef.current?.contains(target) ?? false;

      if (!inControlsMenu) {
        setOpenMenu(null);
      }

      if (!inContextMenu) {
        setContextMenu(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      setOpenMenu(null);
      setContextMenu(null);
    }

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu, openMenu]);

  function toggleMenu(menu: 'audio' | 'subs' | 'settings') {
    setContextMenu(null);
    setOpenMenu((prev) => (prev === menu ? null : menu));
    onRevealControls();
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    const shellRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 260;
    const menuHeight = 240;

    setOpenMenu(null);
    setContextMenu({
      x: clamp(event.clientX - shellRect.left, 10, Math.max(10, shellRect.width - menuWidth)),
      y: clamp(event.clientY - shellRect.top, 10, Math.max(10, shellRect.height - menuHeight)),
    });
    onRevealControls();
  }

  function runContextAction(action: () => void) {
    action();
    setContextMenu(null);
  }

  const showControls =
    isControlsVisible || !isPlaying || openMenu !== null || contextMenu !== null;
  const subtitleFontFamily =
    SUBTITLE_FONT_OPTIONS.find((option) => option.id === subtitleFontPreset)?.family
    ?? SUBTITLE_FONT_OPTIONS[0].family;
  const videoStyle: CSSProperties = {
    ['--player-subtitle-font-family' as string]: subtitleFontFamily,
  };

  return (
    <div
      ref={videoShellRef}
      className={`video-shell ${showControls ? 'controls-visible' : 'controls-hidden'} ${isFullscreen ? 'is-fullscreen' : ''}`}
      onMouseMove={onRevealControls}
      onMouseLeave={() => {
        if (isPlaying && !isSeeking && !openMenu && !contextMenu) {
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

      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="player-context-menu"
          role="menu"
          aria-label="Player options"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className="player-context-menu-item"
            onClick={() => runContextAction(onTogglePlay)}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            role="menuitem"
            className="player-context-menu-item"
            onClick={() => runContextAction(onToggleMute)}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>

          {!isPhoneMode ? (
            <button
              type="button"
              role="menuitem"
              className="player-context-menu-item"
              onClick={() => runContextAction(onToggleTheaterMode)}
            >
              {theaterMode ? 'Exit theater mode' : 'Enter theater mode'}
            </button>
          ) : null}

          {canUsePictureInPicture ? (
            <button
              type="button"
              role="menuitem"
              className="player-context-menu-item"
              onClick={() => runContextAction(onTogglePictureInPicture)}
            >
              {isPictureInPicture ? 'Exit picture-in-picture' : 'Picture-in-picture'}
            </button>
          ) : null}

          {canCast ? (
            <button
              type="button"
              role="menuitem"
              className="player-context-menu-item"
              onClick={() => runContextAction(onOpenCastPicker)}
            >
              {isCasting ? 'Casting to device' : 'Cast to device'}
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="player-context-menu-item"
            onClick={() => runContextAction(onToggleFullscreen)}
          >
            {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          </button>

          <div className="player-context-menu-separator" aria-hidden="true" />

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={showNerdStats}
            className={`player-context-menu-item ${showNerdStats ? 'is-active' : ''}`}
            onClick={() => runContextAction(onToggleNerdStats)}
          >
            <span className="player-context-menu-check" aria-hidden="true">
              {showNerdStats ? <CheckIcon /> : null}
            </span>
            <span>Stats for Nerds</span>
          </button>
        </div>
      ) : null}

      {isBuffering ? (
        <div className="player-buffering-badge" aria-label="Buffering" aria-live="polite">
          <span className="player-spinner-ring-gradient" aria-hidden="true" />
        </div>
      ) : null}

      {showNerdStats ? (
        <aside className="player-nerd-stats" aria-live="polite" aria-label="Playback debug details">
          <div className="player-nerd-stats-header">
            <strong>Stats for Nerds</strong>
            <button
              type="button"
              className="player-nerd-close"
              onClick={onToggleNerdStats}
            >
              Hide
            </button>
          </div>

          <section className="player-nerd-section">
            <h3>Playback</h3>
            <dl className="player-nerd-grid">
              <div>
                <dt>Mode</dt>
                <dd>{isHlsSource ? 'HLS Transcode' : 'Direct Play'}</dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{qualityStatus}</dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>{playbackRate.toFixed(2)}x</dd>
              </div>
              <div>
                <dt>Buffered</dt>
                <dd>{formatStatPercent(bufferedPercent)}</dd>
              </div>
              <div>
                <dt>Buffer Ahead</dt>
                <dd>{videoTelemetry ? formatStatSeconds(videoTelemetry.bufferedAheadSeconds) : 'n/a'}</dd>
              </div>
              <div>
                <dt>Ready State</dt>
                <dd>{videoTelemetry ? describeReadyState(videoTelemetry.readyState) : 'n/a'}</dd>
              </div>
              <div>
                <dt>Network State</dt>
                <dd>{videoTelemetry ? describeNetworkState(videoTelemetry.networkState) : 'n/a'}</dd>
              </div>
              <div>
                <dt>Dropped Frames</dt>
                <dd>
                  {videoTelemetry
                    ? `${videoTelemetry.droppedVideoFrames ?? 0}/${videoTelemetry.totalVideoFrames ?? 0}`
                    : 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Render Size</dt>
                <dd>
                  {videoTelemetry?.renderedWidth && videoTelemetry?.renderedHeight
                    ? `${videoTelemetry.renderedWidth}x${videoTelemetry.renderedHeight}`
                    : 'n/a'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="player-nerd-section">
            <h3>Transcoder</h3>
            <dl className="player-nerd-grid">
              <div>
                <dt>Session</dt>
                <dd>{streamSessionId ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{toStatsTimestamp(hlsSessionStatsUpdatedAt)}</dd>
              </div>
              <div>
                <dt>Segments</dt>
                <dd>
                  {hlsSessionStats
                    ? `${hlsSessionStats.readySegments}/${hlsSessionStats.totalSegments}`
                    : 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Ready %</dt>
                <dd>{hlsSessionStats ? formatStatPercent(hlsSessionStats.readyPercent) : 'n/a'}</dd>
              </div>
              <div>
                <dt>Contiguous</dt>
                <dd>
                  {hlsSessionStats
                    ? `${hlsSessionStats.contiguousReadySegments} (${formatStatSeconds(hlsSessionStats.readyThroughSeconds)})`
                    : 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Inflight</dt>
                <dd>
                  {hlsSessionStats
                    ? hlsSessionStats.inflightSegments.length > 0
                      ? hlsSessionStats.inflightSegments.join(', ')
                      : 'none'
                    : 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Next Segment</dt>
                <dd>
                  {hlsSessionStats
                    ? hlsSessionStats.nextSegmentIndex !== null
                      ? hlsSessionStats.nextSegmentIndex
                      : 'complete'
                    : 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Recoveries</dt>
                <dd>{hlsSessionStats ? hlsSessionStats.recoverableStartFailures : 'n/a'}</dd>
              </div>
            </dl>

            {hlsSessionStatsError ? (
              <p className="player-nerd-error">{hlsSessionStatsError}</p>
            ) : null}
          </section>

          <section className="player-nerd-section">
            <h3>Network</h3>
            <dl className="player-nerd-grid">
              <div>
                <dt>URL</dt>
                <dd className="is-mono" title={streamUrl ?? 'n/a'}>{streamUrl ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Torrent</dt>
                <dd>{downloadingTorrent?.state ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Torrent Progress</dt>
                <dd>
                  {downloadingTorrent
                    ? formatStatPercent(clamp(downloadingTorrent.progress * 100, 0, 100))
                    : 'n/a'}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      ) : null}

      <div className={`player-controls-panel ${showControls ? 'is-visible' : 'is-hidden'}`}>
        <div className="player-controls-top">
          <div className="player-title-block">
            <h2>{media?.title ?? 'Preparing stream…'}</h2>
          </div>
          <div className="player-inline-badges" aria-label="Playback metadata">
            <span>{qualityStatus}</span>
          </div>
        </div>

        <div className="player-controls-lower">
          <div className="player-seekbar-wrap" onMouseMove={onSeekPreview} onMouseLeave={onClearSeekPreview}>
            <div className="player-seekbar-base" aria-hidden="true" />
            <div className="player-seekbar-buffered" style={{ width: `${bufferedPercent}%` }} aria-hidden="true" />
            <div className="player-seekbar-played" style={{ width: `${playedPercent}%` }} aria-hidden="true" />

            {(media?.chapterThumbnails ?? []).map((chapter, index) => {
              const markerLeft = clamp((chapter.second / safeDuration) * 100, 0, 100);
              return (
                <button
                  key={`chapter-marker-${index}`}
                  type="button"
                  className="player-chapter-marker"
                  style={{ left: `${markerLeft}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSeekTo(chapter.second);
                  }}
                  title={`Jump to ${formatClock(chapter.second)}`}
                  aria-label={`Jump to chapter at ${formatClock(chapter.second)}`}
                />
              );
            })}

            <input
              className="player-seekbar-input"
              type="range"
              min={0}
              max={Math.max(totalDuration, 0)}
              step={0.1}
              value={isSeeking ? seekValue : currentTime}
              onChange={onSeekInputChange}
              onMouseDown={onSeekPointerDown}
              onMouseUp={onSeekPointerUp}
              onTouchStart={onSeekPointerDown}
              onTouchEnd={onSeekTouchEnd}
              aria-label="Seek video timeline"
            />

            {seekPreviewSeconds !== null ? (
              <div className="player-seek-preview" style={{ left: `${clamp((seekPreviewSeconds / safeDuration) * 100, 0, 100)}%` }}>
                {formatClock(seekPreviewSeconds)}
              </div>
            ) : null}
          </div>

          <div className="player-controls-bottom">
            <div className="player-controls-left">
              <button
                type="button"
                className={`player-icon-button player-icon-button-primary ${isPhoneMode ? 'is-phone-mode' : ''}`}
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isPhoneMode
                  ? (isPlaying ? 'Pause' : 'Play')
                  : (isPlaying ? 'Pause (Space)' : 'Play (Space)')}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              {!isPhoneMode ? (
                <button
                  type="button"
                  className="player-icon-button"
                  onClick={() => onSkipBy(-SKIP_SECONDS)}
                  aria-label="Back 10 seconds"
                  title="Back 10s (J)"
                >
                  <SkipBackIcon />
                </button>
              ) : null}

              {!isPhoneMode ? (
                <button
                  type="button"
                  className="player-icon-button"
                  onClick={() => onSkipBy(SKIP_SECONDS)}
                  aria-label="Forward 10 seconds"
                  title="Forward 10s (L)"
                >
                  <SkipForwardIcon />
                </button>
              ) : null}

              <div className="player-volume-control">
                <button
                  type="button"
                  className="player-icon-button"
                  onClick={onToggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  title={isPhoneMode
                    ? (muted ? 'Unmute' : 'Mute')
                    : (muted ? 'Unmute (M)' : 'Mute (M)')}
                >
                  <VolumeIcon muted={muted} volume={volume} />
                </button>
                <input
                  type="range"
                  className="player-volume-slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    onApplyVolume(Number(event.target.value));
                  }}
                  aria-label="Volume"
                  style={{ ['--vol-fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
                />
              </div>

              <p className="player-time-readout">
                <span>{formatClock(currentTime)}</span>
                <span className="player-time-sep">/</span>
                <span>{formatClock(totalDuration)}</span>
              </p>
            </div>

            <div className="player-controls-right" ref={menuRootRef}>
              <div className="player-menu-anchor">
                <button
                  type="button"
                  className={`player-icon-button ${selectedAudioStreamIndex !== null ? 'is-active' : ''}`}
                  onClick={() => toggleMenu('audio')}
                  aria-label="Audio tracks"
                  aria-expanded={openMenu === 'audio'}
                  title="Audio tracks"
                >
                  <VolumeHighIcon />
                </button>

                {openMenu === 'audio' ? (
                  <div className="player-menu" role="menu" aria-label="Audio tracks">
                    <p className="player-menu-heading">Audio</p>

                    {audioTracks.length === 0 ? (
                      <p className="player-menu-empty">No alternate audio tracks detected.</p>
                    ) : null}

                    {audioTracks.map((track) => {
                      const isSelected = selectedAudioStreamIndex === track.streamIndex;
                      return (
                        <button
                          key={`audio-${track.streamIndex}`}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          className={`player-menu-item ${isSelected ? 'is-active' : ''}`}
                          onClick={() => {
                            onSelectAudioTrack(track.streamIndex);
                            setOpenMenu(null);
                          }}
                        >
                          <span className="player-menu-check">
                            {isSelected ? <CheckIcon /> : null}
                          </span>
                          <span className="player-menu-label">
                            <span className="player-menu-primary">{track.label}</span>
                            <span className="player-menu-secondary">
                              {track.language ? track.language.toUpperCase() : 'unknown language'}
                              {track.codec ? ` · ${track.codec.toUpperCase()}` : ''}
                              {track.channels !== null ? ` · ${track.channels}ch` : ''}
                              {track.isDefault ? ' · default' : ''}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="player-menu-anchor">
                <button
                  type="button"
                  className={`player-icon-button ${activeSubtitle ? 'is-active' : ''}`}
                  onClick={() => toggleMenu('subs')}
                  aria-label="Subtitles"
                  aria-expanded={openMenu === 'subs'}
                  title={isPhoneMode ? 'Subtitles' : 'Subtitles (C)'}
                >
                  <CaptionsIcon />
                </button>

                {openMenu === 'subs' ? (
                  <div className="player-menu" role="menu" aria-label="Subtitles">
                    <p className="player-menu-heading">Subtitles</p>

                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedSubtitleId === ''}
                      className={`player-menu-item ${selectedSubtitleId === '' ? 'is-active' : ''}`}
                      onClick={() => {
                        onSelectSubtitle('');
                        setOpenMenu(null);
                      }}
                    >
                      <span className="player-menu-check">
                        {selectedSubtitleId === '' ? <CheckIcon /> : null}
                      </span>
                      <span className="player-menu-label">
                        <span className="player-menu-primary">Off</span>
                      </span>
                    </button>

                    {subtitleTracks.length === 0 ? (
                      <p className="player-menu-empty">No subtitles detected yet.</p>
                    ) : null}

                    {subtitleTracks.map((track) => {
                      const isSelected = selectedSubtitleId === track.id;
                      const ready = !!track.url;
                      return (
                        <div className="player-menu-row" key={track.id}>
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            className={`player-menu-item ${isSelected ? 'is-active' : ''}`}
                            onClick={() => {
                              if (!ready) return;
                              onSelectSubtitle(track.id);
                              setOpenMenu(null);
                            }}
                            disabled={!ready && !track.extractable}
                          >
                            <span className="player-menu-check">
                              {isSelected ? <CheckIcon /> : null}
                            </span>
                            <span className="player-menu-label">
                              <span className="player-menu-primary">{track.label}</span>
                              <span className="player-menu-secondary">
                                {track.format.toUpperCase()}
                                {track.language ? ` · ${track.language}` : ''}
                                {!ready ? (track.extractable ? ' · needs extraction' : ' · unavailable') : ''}
                              </span>
                            </span>
                          </button>
                          {!ready && track.extractable ? (
                            <button
                              type="button"
                              className="player-menu-mini"
                              onClick={() => {
                                onExtractSubtitle(track);
                              }}
                            >
                              Extract
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="player-menu-anchor">
                <button
                  type="button"
                  className="player-icon-button"
                  onClick={() => toggleMenu('settings')}
                  aria-label="Settings"
                  aria-expanded={openMenu === 'settings'}
                  title="Playback settings"
                >
                  <SettingsIcon />
                </button>

                {openMenu === 'settings' ? (
                  <div className="player-menu" role="menu" aria-label="Playback settings">
                    <p className="player-menu-heading">Speed</p>
                    <div className="player-menu-chiprow">
                      {SPEED_OPTIONS.map((speed) => (
                        <button
                          key={`speed-${speed}`}
                          type="button"
                          className={`player-menu-chip ${playbackRate === speed ? 'is-active' : ''}`}
                          onClick={() => onPlaybackRateChange(speed)}
                        >
                          {speed}×
                        </button>
                      ))}
                    </div>

                    <p className="player-menu-heading">Subtitle Font</p>
                    <div className="player-menu-chiprow">
                      {SUBTITLE_FONT_OPTIONS.map((option) => (
                        <button
                          key={`subtitle-font-${option.id}`}
                          type="button"
                          className={`player-menu-chip ${subtitleFontPreset === option.id ? 'is-active' : ''}`}
                          onClick={() => onSubtitleFontPresetChange(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {isHlsSource && hlsLevels.length > 0 ? (
                      <>
                        <p className="player-menu-heading">Quality</p>
                        <div className="player-menu-chiprow">
                          <button
                            type="button"
                            className={`player-menu-chip ${qualityMode === 'auto' ? 'is-active' : ''}`}
                            onClick={() => onQualityModeChange('auto')}
                          >
                            Auto
                          </button>
                          {hlsLevels.map((level) => (
                            <button
                              key={`quality-${level.index}`}
                              type="button"
                              className={`player-menu-chip ${qualityMode === level.index ? 'is-active' : ''}`}
                              onClick={() => onQualityModeChange(level.index)}
                            >
                              {level.label}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {canCast ? (
                <button
                  type="button"
                  className={`player-icon-button ${isCasting ? 'is-active' : ''} ${!isCasting && !castDeviceAvailable ? 'is-idle' : ''}`}
                  onClick={onOpenCastPicker}
                  aria-label={isCasting ? 'Casting to device' : 'Cast to device'}
                  title={
                    isCasting
                      ? 'Casting to device'
                      : castDeviceAvailable
                        ? 'Cast to device'
                        : 'Search for cast devices'
                  }
                >
                  <CastIcon />
                </button>
              ) : null}

              {!isPhoneMode ? (
                <button
                  type="button"
                  className={`player-icon-button ${theaterMode ? 'is-active' : ''}`}
                  onClick={onToggleTheaterMode}
                  aria-label={theaterMode ? 'Disable theater mode' : 'Enable theater mode'}
                  title="Theater mode"
                >
                  <TheaterIcon />
                </button>
              ) : null}

              {canUsePictureInPicture ? (
                <button
                  type="button"
                  className={`player-icon-button ${isPictureInPicture ? 'is-active' : ''}`}
                  onClick={onTogglePictureInPicture}
                  aria-label={isPictureInPicture ? 'Exit picture-in-picture' : 'Enter picture-in-picture'}
                  title={isPhoneMode ? 'Picture-in-picture' : 'Picture-in-picture (P)'}
                >
                  <PipIcon />
                </button>
              ) : null}

              <button
                type="button"
                className={`player-icon-button ${isFullscreen ? 'is-active' : ''}`}
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isPhoneMode ? 'Fullscreen' : 'Fullscreen (F)'}
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

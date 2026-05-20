import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { withAccessToken } from '../../lib/api';
import type { MediaItem, SubtitleTrack } from '../../lib/types';
import {
  clamp,
  formatClock,
  SKIP_SECONDS,
  SPEED_OPTIONS,
  type HlsLevelOption,
} from '../../pages/player/playerUtils';
import {
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

interface PlayerVideoPanelProps {
  token: string;
  media: MediaItem | null;
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
  muted: boolean;
  volume: number;
  playbackRate: number;
  theaterMode: boolean;
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
  onRevealControls: () => void;
  onHideControls: () => void;
  onTogglePlay: () => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onToggleTheaterMode: () => void;
  onTogglePictureInPicture: () => void;
  onSkipBy: (deltaSeconds: number) => void;
  onSeekTo: (seconds: number) => void;
  onApplyVolume: (nextVolume: number) => void;
  onPlaybackRateChange: (nextRate: number) => void;
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

export function PlayerVideoPanel({
  token,
  media,
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
  muted,
  volume,
  playbackRate,
  theaterMode,
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
  onRevealControls,
  onHideControls,
  onTogglePlay,
  onToggleFullscreen,
  onToggleMute,
  onToggleTheaterMode,
  onTogglePictureInPicture,
  onSkipBy,
  onSeekTo,
  onApplyVolume,
  onPlaybackRateChange,
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
  const [openMenu, setOpenMenu] = useState<null | 'subs' | 'settings'>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!menuRootRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    }

    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [openMenu]);

  function toggleMenu(menu: 'subs' | 'settings') {
    setOpenMenu((prev) => (prev === menu ? null : menu));
    onRevealControls();
  }

  const showControls = isControlsVisible || !isPlaying || openMenu !== null;

  return (
    <div
      ref={videoShellRef}
      className={`video-shell ${showControls ? 'controls-visible' : 'controls-hidden'}`}
      onMouseMove={onRevealControls}
      onMouseLeave={() => {
        if (isPlaying && !isSeeking && !openMenu) {
          onHideControls();
        }
      }}
      onTouchStart={onRevealControls}
    >
      <video
        ref={videoRef}
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

      {isBuffering ? (
        <div className="player-buffering-badge" aria-live="polite">
          <span className="player-spinner" aria-hidden="true" />
          <span>Buffering…</span>
        </div>
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
                className="player-icon-button player-icon-button-primary"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <button
                type="button"
                className="player-icon-button"
                onClick={() => onSkipBy(-SKIP_SECONDS)}
                aria-label="Back 10 seconds"
                title="Back 10s (J)"
              >
                <SkipBackIcon />
              </button>

              <button
                type="button"
                className="player-icon-button"
                onClick={() => onSkipBy(SKIP_SECONDS)}
                aria-label="Forward 10 seconds"
                title="Forward 10s (L)"
              >
                <SkipForwardIcon />
              </button>

              <div className="player-volume-control">
                <button
                  type="button"
                  className="player-icon-button"
                  onClick={onToggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  title={muted ? 'Unmute (M)' : 'Mute (M)'}
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
                  className={`player-icon-button ${activeSubtitle ? 'is-active' : ''}`}
                  onClick={() => toggleMenu('subs')}
                  aria-label="Subtitles"
                  aria-expanded={openMenu === 'subs'}
                  title="Subtitles (C)"
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

              <button
                type="button"
                className={`player-icon-button ${theaterMode ? 'is-active' : ''}`}
                onClick={onToggleTheaterMode}
                aria-label={theaterMode ? 'Disable theater mode' : 'Enable theater mode'}
                title="Theater mode"
              >
                <TheaterIcon />
              </button>

              {canUsePictureInPicture ? (
                <button
                  type="button"
                  className={`player-icon-button ${isPictureInPicture ? 'is-active' : ''}`}
                  onClick={onTogglePictureInPicture}
                  aria-label={isPictureInPicture ? 'Exit picture-in-picture' : 'Enter picture-in-picture'}
                  title="Picture-in-picture (P)"
                >
                  <PipIcon />
                </button>
              ) : null}

              <button
                type="button"
                className={`player-icon-button ${isFullscreen ? 'is-active' : ''}`}
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title="Fullscreen (F)"
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
